import { Amplify } from 'aws-amplify';

export interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  isConfigured: boolean;
}

export const getCognitoConfig = (): CognitoConfig => {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
  const region = import.meta.env.VITE_AWS_REGION || 'ap-southeast-2';

  const isConfigured = Boolean(
    userPoolId &&
    userPoolClientId &&
    !userPoolId.includes('xxxxxxxxx') &&
    !userPoolClientId.includes('xxxxxxxxxx')
  );

  return {
    userPoolId,
    userPoolClientId,
    region,
    isConfigured,
  };
};

export const configureAmplify = (): void => {
  const config = getCognitoConfig();

  if (config.isConfigured) {
    try {
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: config.userPoolId,
            userPoolClientId: config.userPoolClientId,
            loginWith: {
              email: true,
            },
          },
        },
      });
    } catch (e) {
      console.error('Failed to configure AWS Amplify Auth:', e);
    }
  }
};

// Automatically execute on module load
configureAmplify();
