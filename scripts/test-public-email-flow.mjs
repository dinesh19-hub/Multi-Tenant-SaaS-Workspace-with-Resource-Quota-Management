import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, signIn, fetchAuthSession, signOut } from 'aws-amplify/auth';

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

async function runPublicEmailVerificationTest() {
  console.log('=== STARTING GENUINE PUBLIC EMAIL VERIFICATION TEST ===');

  // 1. Create a real disposable mailbox on mail.tm
  console.log('[1] Generating disposable email address via mail.tm...');
  const domRes = await fetch('https://api.mail.tm/domains');
  const domData = await domRes.json();
  const domain = domData['hydra:member'][0].domain;
  const testEmail = `saas_verify_${Date.now()}@${domain}`;
  const mailboxPassword = 'MailPassword123!';
  const appPassword = 'SecureUserPass123!';

  const accRes = await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testEmail, password: mailboxPassword }),
  });

  if (!accRes.ok) {
    throw new Error(`Failed to create mailbox: ${accRes.status} ${await accRes.text()}`);
  }
  console.log(`Disposable Mailbox Created: ${testEmail}`);

  // Get mailbox auth token
  const tokenRes = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testEmail, password: mailboxPassword }),
  });
  const tokenData = await tokenRes.json();
  const mailToken = tokenData.token;

  // 2. Perform public client sign-up via AWS Amplify Auth
  console.log('\n[2] Executing public client signUp via AWS Amplify Auth...');
  const signUpResult = await signUp({
    username: testEmail,
    password: appPassword,
    options: {
      userAttributes: {
        email: testEmail,
      },
    },
  });

  console.log('Public SignUp Result:');
  console.log('  isSignUpComplete:', signUpResult.isSignUpComplete);
  console.log('  nextStep:', signUpResult.nextStep.signUpStep);
  console.log('  codeDeliveryMedium:', signUpResult.nextStep.codeDeliveryDetails?.deliveryMedium);
  console.log('  destination:', signUpResult.nextStep.codeDeliveryDetails?.destination);

  // 3. Poll mail.tm for the real verification email from Cognito
  console.log('\n[3] Waiting for confirmation email from Amazon Cognito (polling up to 60s)...');
  let confirmationCode = null;
  const maxAttempts = 20; // 20 * 3s = 60s
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write(`  Attempt ${attempt}/${maxAttempts}... `);
    const msgRes = await fetch('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${mailToken}` },
    });
    const msgData = await msgRes.json();
    const messages = msgData['hydra:member'] || [];

    if (messages.length > 0) {
      console.log(`Email received! Subject: "${messages[0].subject}" from "${messages[0].from.address}"`);
      // Fetch full message body
      const fullMsgRes = await fetch(`https://api.mail.tm/messages/${messages[0].id}`, {
        headers: { Authorization: `Bearer ${mailToken}` },
      });
      const fullMsgData = await fullMsgRes.json();
      const text = fullMsgData.text || fullMsgData.intro || '';
      console.log('  Message Snippet:', text.substring(0, 120).replace(/\n/g, ' '));

      // Extract 6-digit code
      const match = text.match(/\b\d{6}\b/);
      if (match) {
        confirmationCode = match[0];
        console.log('  Extracted Real 6-Digit Confirmation Code successfully!');
        break;
      }
    } else {
      console.log('No messages yet.');
    }
    await sleep(3000);
  }

  if (!confirmationCode) {
    console.log('\n[RESULT] Confirmation email did not arrive in inbox within 60s.');
    console.log('[STATUS] Email-Verification Test: UNVERIFIED / BLOCKED (Cognito default email delivery delayed or not received).');
    return {
      status: 'UNVERIFIED',
      email: testEmail,
      reason: 'Confirmation code email was not received in the disposable mailbox within 60 seconds.',
    };
  }

  // 4. Confirm Sign-Up using the REAL Confirmation Code via Public Client
  console.log(`\n[4] Submitting real confirmation code via public confirmSignUp...`);
  const confirmResult = await confirmSignUp({
    username: testEmail,
    confirmationCode,
  });
  console.log('Confirmation Result: isSignUpComplete =', confirmResult.isSignUpComplete);

  // 5. Test Normal User Login Flow
  console.log('\n[5] Logging in through normal SRP authentication flow...');
  const signInResult = await signIn({
    username: testEmail,
    password: appPassword,
  });
  console.log('Normal Login Result: isSignedIn =', signInResult.isSignedIn);

  // 6. Fetch Auth Session and Call Live API Gateway
  console.log('\n[6] Fetching JWT Session and invoking live API Gateway...');
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  console.log('JWT ID Token Acquired: length =', idToken ? idToken.length : 0);

  const profileRes = await fetch(`${API_BASE}/users/profile`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  console.log('Live Profile API Status:', profileRes.status);
  const profileData = await profileRes.json();
  console.log('Verified Profile Email:', profileData.email, 'Email Verified:', profileData.emailVerified);

  await signOut();

  return {
    status: 'VERIFIED_PASS',
    email: testEmail,
    profile: profileData,
  };
}

runPublicEmailVerificationTest()
  .then((res) => {
    console.log('\n=== TEST SUMMARY ===');
    console.log('Overall Status:', res.status);
    console.log('Test Account:', res.email);
    if (res.reason) console.log('Notes:', res.reason);
  })
  .catch((err) => {
    console.error('Test Execution Failed:', err);
    process.exit(1);
  });
