import { google } from "googleapis";

export function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.OAUTH_REDIRECT_URI ?? process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and one of OAUTH_REDIRECT_URI/GOOGLE_REDIRECT_URI",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getOAuth2ClientForSession(
  refreshToken: string | undefined,
): InstanceType<typeof google.auth.OAuth2> | null {
  if (!refreshToken) return null;
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
