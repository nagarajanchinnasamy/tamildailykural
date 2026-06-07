import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/youtube'];
const TOKEN_PATH = path.join(process.cwd(), '../../data/youtube_token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), '../../client_secrets.json');

export async function authorize() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`client_secrets.json not found at ${CREDENTIALS_PATH}. Please download it from Google Cloud Console.`);
  }

  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  if (!client_id || !client_secret || !redirect_uris) {
      throw new Error('Invalid client_secrets.json format. Expected "installed" or "web" key with client_id, client_secret, and redirect_uris.');
  }

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );

  // Check if we have previously stored a token.
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // Otherwise, ask user to authenticate
  return await getNewToken(oAuth2Client);
}

async function getNewToken(oAuth2Client: any) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  
  console.log('====================================================');
  console.log('Authorize this app by visiting this url:');
  console.log(authUrl);
  console.log('====================================================');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        // Store the token to disk for later program executions
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      } catch (err) {
        console.error('Error retrieving access token', err);
        reject(err);
      }
    });
  });
}
