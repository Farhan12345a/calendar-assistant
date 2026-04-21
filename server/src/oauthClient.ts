import { OAuth2Client } from "google-auth-library";

//OAuth client factory reads env and builds the Google OAuth2 client (supports both redirect env names):
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.OAUTH_REDIRECT_URI ?? process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and one of OAUTH_REDIRECT_URI/GOOGLE_REDIRECT_URI",
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function getOAuth2ClientForSession(
  refreshToken: string | undefined,
): OAuth2Client | null {
  if (!refreshToken) return null;
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
