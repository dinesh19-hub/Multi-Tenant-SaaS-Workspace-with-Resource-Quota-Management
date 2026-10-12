import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, signIn, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { execSync } from 'child_process';

const REGION = 'ap-southeast-2';
const USER_POOL_ID = 'ap-southeast-2_EFWnRtGuA';
const CLIENT_ID = '4b7blb7ojmv1drb91715i2676';
const API_BASE = 'https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: USER_POOL_ID,
      userPoolClientId: CLIENT_ID,
    },
  },
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createMailbox() {
  const domRes = await fetch('https://api.mail.tm/domains');
  const domData = await domRes.json();
  const domain = domData['hydra:member'][0].domain;
  const address = `saas_e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}@${domain}`;
  const password = 'MailPassword123!';

  const accRes = await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  if (!accRes.ok) throw new Error(`Create mailbox failed: ${accRes.status}`);

  const tokRes = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  const tokData = await tokRes.json();
  return { address, password, token: tokData.token };
}

async function waitForCode(mailToken, maxAttempts = 15) {
  for (let i = 1; i <= maxAttempts; i++) {
    await sleep(2000);
    const msgRes = await fetch('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${mailToken}` },
    });
    const msgData = await msgRes.json();
    const messages = msgData['hydra:member'] || [];
    if (messages.length > 0) {
      const detailRes = await fetch(`https://api.mail.tm/messages/${messages[0].id}`, {
        headers: { Authorization: `Bearer ${mailToken}` },
      });
      const detailData = await detailRes.json();
      const htmlBody = (detailData.html && detailData.html[0]) || '';
      const textBody = detailData.text || '';
      const content = htmlBody + ' ' + textBody;
      const match = content.match(/\b\d{6}\b/);
      if (match) return match[0];
    }
  }
  throw new Error('Timeout waiting for confirmation email from Cognito');
}

async function apiCall(method, path, token, body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://main.d2h2pxsqugbcgb.amplifyapp.com',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

async function run() {
  console.log('=== STARTING E2E POST-CORS FINAL INTEGRATION TEST ===\n');
  const results = {};

  // Step 1: Create dedicated mailbox A & register User A
  console.log('1. Creating disposable mailbox for User A...');
  const userA = await createMailbox();
  const appPassword = 'SecureUserPass123!';
  console.log(`   User A Email: ${userA.address}`);

  console.log('2. Public client signUp for User A...');
  const signUpResA = await signUp({
    username: userA.address,
    password: appPassword,
    options: { userAttributes: { email: userA.address } },
  });
  console.log(`   SignUp Success: userId ${signUpResA.userId}, isSignUpComplete: ${signUpResA.isSignUpComplete}`);
  results.signUpA = signUpResA.userId ? 'PASS' : 'FAIL';

  console.log('3. Polling for real Cognito verification code for User A...');
  const codeA = await waitForCode(userA.token);
  console.log(`   Received real confirmation code: ${codeA}`);

  console.log('4. Calling public confirmSignUp with real code...');
  const confResA = await confirmSignUp({ username: userA.address, confirmationCode: codeA });
  console.log(`   ConfirmSignUp completed: ${confResA.isSignUpComplete}`);
  results.confirmA = confResA.isSignUpComplete ? 'PASS' : 'FAIL';

  console.log('5. User A public SRP login via Amplify Auth...');
  const signInResA = await signIn({ username: userA.address, password: appPassword });
  console.log(`   SignIn success: isSignedIn = ${signInResA.isSignedIn}`);
  const sessionA = await fetchAuthSession();
  const tokenA = sessionA.tokens?.idToken?.toString();
  console.log(`   ID Token acquired (length: ${tokenA.length})`);
  results.signInA = signInResA.isSignedIn ? 'PASS' : 'FAIL';

  // Step 2: User A API Gateway calls with Origin: https://main.d2h2pxsqugbcgb.amplifyapp.com
  console.log('\n6. Calling GET /users/profile with Amplify Origin...');
  const profResA = await apiCall('GET', '/users/profile', tokenA);
  console.log(`   Profile API Status: ${profResA.status}, email: ${profResA.data?.email}`);
  results.profileA = profResA.status === 200 ? 'PASS' : 'FAIL';

  console.log('7. Creating Organization A (tier: FREE, maxProjects: 10, maxMembers: 5)...');
  const orgResA = await apiCall('POST', '/organizations', tokenA, {
    name: 'Alpha Enterprise Org',
    tier: 'FREE',
  });
  const orgAId = orgResA.data?.orgId;
  console.log(`   Org A Status: ${orgResA.status}, orgId: ${orgAId}`);
  results.createOrgA = orgResA.status === 201 && orgAId ? 'PASS' : 'FAIL';

  console.log('8. Creating Project 1 in Organization A...');
  const projResA = await apiCall('POST', `/organizations/${orgAId}/projects`, tokenA, {
    name: 'Alpha Mission Control',
    description: 'Mission control for SaaS project',
  });
  const projAId = projResA.data?.projectId;
  console.log(`   Project 1 Status: ${projResA.status}, projectId: ${projAId}`);
  results.createProjA = projResA.status === 201 && projAId ? 'PASS' : 'FAIL';

  console.log('9. Checking Quota & Analytics for Organization A...');
  const analResA = await apiCall('GET', `/organizations/${orgAId}/analytics`, tokenA);
  console.log(`   Analytics Status: ${analResA.status}`);
  const quotas = analResA.data?.quotas;
  console.log(`   Quota Usage: Projects ${quotas?.projectCount}/${quotas?.maxProjects} (${quotas?.projectUtilizationPercent}%), Members ${quotas?.memberCount}/${quotas?.maxMembers} (${quotas?.memberUtilizationPercent}%)`);
  results.quotaA = analResA.status === 200 && quotas?.projectCount === 1 ? 'PASS' : 'FAIL';

  // Step 3: DynamoDB Physical Record Verification
  console.log('\n10. Verifying physical persistence in DynamoDB...');
  const ddbOutput = execSync(`aws dynamodb get-item --table-name saas-workspace-stack-table --key "{\\"PK\\":{\\"S\\":\\"ORG#${orgAId}\\"},\\"SK\\":{\\"S\\":\\"METADATA\\"}}" --region ap-southeast-2`).toString();
  const ddbItem = JSON.parse(ddbOutput).Item;
  console.log(`    DynamoDB verified: PK = ${ddbItem?.PK?.S}, name = ${ddbItem?.name?.S}, tier = ${ddbItem?.tier?.S}`);
  results.ddbPersistence = ddbItem?.PK?.S === `ORG#${orgAId}` ? 'PASS' : 'FAIL';

  // Step 4: Cross-Tenant Isolation Test with User B
  console.log('\n11. Setting up User B for Cross-Tenant Isolation verification...');
  const userB = await createMailbox();
  console.log(`    User B Email: ${userB.address}`);
  const signUpResB = await signUp({
    username: userB.address,
    password: appPassword,
    options: { userAttributes: { email: userB.address } },
  });
  const codeB = await waitForCode(userB.token);
  await confirmSignUp({ username: userB.address, confirmationCode: codeB });
  await signOut();

  const signInResB = await signIn({ username: userB.address, password: appPassword });
  const sessionB = await fetchAuthSession();
  const tokenB = sessionB.tokens?.idToken?.toString();
  console.log(`    User B Authenticated. Attempting unauthorized access to Organization A's projects...`);

  const breachAttempt = await apiCall('GET', `/organizations/${orgAId}/projects`, tokenB);
  console.log(`    Breach Attempt Status: ${breachAttempt.status}`);
  console.log(`    Breach Error Response: ${JSON.stringify(breachAttempt.data)}`);
  results.tenantIsolation = breachAttempt.status === 403 && breachAttempt.data?.code === 'NOT_A_MEMBER' ? 'PASS' : 'FAIL';

  // Step 5: Clean Up
  console.log('\n12. Multi-phase cleanup...');
  await signOut();
  await signIn({ username: userA.address, password: appPassword });
  const finalSession = await fetchAuthSession();
  const finalToken = finalSession.tokens?.idToken?.toString();

  const delOrgRes = await apiCall('DELETE', `/organizations/${orgAId}`, finalToken);
  console.log(`    Cascade Delete Org A Status: ${delOrgRes.status}`);
  results.deleteOrgA = delOrgRes.status === 200 ? 'PASS' : 'FAIL';

  // Purge test users from Cognito
  execSync(`aws cognito-idp admin-delete-user --user-pool-id ${USER_POOL_ID} --username ${signUpResA.userId} --region ${REGION}`);
  execSync(`aws cognito-idp admin-delete-user --user-pool-id ${USER_POOL_ID} --username ${signUpResB.userId} --region ${REGION}`);
  console.log('    Cognito test users deleted.');

  const scanCheck = execSync(`aws dynamodb scan --table-name saas-workspace-stack-table --select COUNT --region ${REGION}`).toString();
  const count = JSON.parse(scanCheck).Count;
  console.log(`    DynamoDB scan count: ${count}`);
  results.tableClean = count === 0 ? 'PASS' : 'FAIL';

  console.log('\n=== FINAL TEST RESULTS MATRIX ===');
  console.table(results);
}

run().catch((err) => {
  console.error('Fatal error during E2E test:', err);
  process.exit(1);
});
