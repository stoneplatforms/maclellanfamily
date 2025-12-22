#!/usr/bin/env python3
"""
Dropbox Refresh Token Generator (Python)

This script helps you get a refresh token for Dropbox OAuth.
Perfect for when YOU have the app credentials but ANOTHER PERSON 
needs to authorize access to THEIR Dropbox account.

Usage: python get_dropbox_refresh_token.py
"""

import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
import os

def print_header(title):
    """Print a formatted header"""
    print("\n" + "=" * 70)
    print(f"{title}")
    print("=" * 70 + "\n")

def make_request(url, data=None, headers=None):
    """Make HTTP request"""
    if headers is None:
        headers = {}
    
    if data is not None:
        data = urllib.parse.urlencode(data).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    
    req = urllib.request.Request(url, data=data, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            response_data = response.read().decode('utf-8')
            return {
                'status': response.status,
                'data': json.loads(response_data)
            }
    except urllib.error.HTTPError as e:
        error_data = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_data)
        except:
            error_json = {'error': error_data}
        return {
            'status': e.code,
            'data': error_json
        }

def save_tokens(tokens, client_id, client_secret):
    """Save tokens to files"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Complete token info
    token_data = {
        'refresh_token': tokens['refresh_token'],
        'access_token': tokens['access_token'],
        'expires_in': tokens['expires_in'],
        'token_type': tokens['token_type'],
        'account_id': tokens.get('account_id', ''),
        'client_id': client_id,
        'client_secret': client_secret,
        'created_at': datetime.now().isoformat()
    }
    
    # Save JSON file
    json_path = os.path.join(script_dir, 'dropbox-tokens.json')
    with open(json_path, 'w') as f:
        json.dump(token_data, f, indent=2)
    print(f"📄 Saved tokens to: {json_path}")
    
    # Save refresh token separately
    token_path = os.path.join(script_dir, 'dropbox-refresh-token.txt')
    with open(token_path, 'w') as f:
        f.write(tokens['refresh_token'])
    print(f"📄 Saved refresh token to: {token_path}")
    
    # Save .env snippet
    env_snippet = f"""# Dropbox OAuth Tokens (generated {datetime.now().isoformat()})
DROPBOX_CLIENT_ID={client_id}
DROPBOX_CLIENT_SECRET={client_secret}
DROPBOX_REFRESH_TOKEN={tokens['refresh_token']}

# Remove or comment out DROPBOX_ACCESS_TOKEN (it expires!)
# DROPBOX_ACCESS_TOKEN=...
"""
    
    env_path = os.path.join(script_dir, 'dropbox-env-snippet.txt')
    with open(env_path, 'w') as f:
        f.write(env_snippet)
    print(f"📄 Saved .env snippet to: {env_path}\n")

def test_refresh_token(client_id, client_secret, refresh_token):
    """Test the refresh token by getting a new access token"""
    print_header("Testing Refresh Token")
    
    data = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': client_id,
        'client_secret': client_secret
    }
    
    print("Requesting new access token using refresh token...\n")
    
    response = make_request('https://api.dropboxapi.com/oauth2/token', data=data)
    
    if response['status'] == 200:
        print("✅ Success! Refresh token works!\n")
        access_token = response['data']['access_token']
        print(f"New access token: {access_token[:20]}...")
        print(f"Expires in: {response['data']['expires_in']} seconds\n")
        print("Your refresh token is valid and ready to use! 🎉\n")
        return True
    else:
        print("❌ Error testing refresh token:")
        print(json.dumps(response['data'], indent=2))
        return False

def main():
    """Main function"""
    print_header("🔐 Dropbox Refresh Token Generator (Python)")
    
    print("This script will help you get a refresh token for Dropbox.")
    print("Refresh tokens never expire (unlike access tokens).\n")
    
    print("⚠️  IMPORTANT: Multi-Person Workflow")
    print("-" * 70)
    print("This is perfect when:")
    print("  • YOU have the Dropbox app credentials (Client ID & Secret)")
    print("  • ANOTHER PERSON owns the Dropbox account")
    print("  • They need to authorize access to THEIR account")
    print("  • They will send you the authorization code\n")
    
    # Step 1: Get credentials
    print_header("Step 1: Enter Dropbox App Credentials")
    print("(YOU have these from the Dropbox App Console)\n")
    print("Go to: https://www.dropbox.com/developers/apps")
    print("Click your app → Settings tab\n")
    
    client_id = input("Enter your App Key (Client ID): ").strip()
    client_secret = input("Enter your App Secret (Client Secret): ").strip()
    
    if not client_id or not client_secret:
        print("\n❌ Client ID and Secret are required!")
        return
    
    # Step 2: Generate authorization URL
    print_header("Step 2: Send This Link to the Dropbox Account Owner")
    
    auth_url = (
        f"https://www.dropbox.com/oauth2/authorize?"
        f"client_id={urllib.parse.quote(client_id)}"
        f"&response_type=code"
        f"&token_access_type=offline"
    )
    
    print("📧 SEND THIS ENTIRE URL TO THE PERSON WHO OWNS THE DROPBOX ACCOUNT:\n")
    print("━" * 70)
    print(auth_url)
    print("━" * 70)
    print()
    
    print("📋 Instructions for them:")
    print("1. Open the URL above in their browser")
    print("2. They will be asked to log into THEIR Dropbox account")
    print("3. Click 'Allow' to authorize your app")
    print("4. They'll be redirected to a page with an authorization code")
    print("5. Ask them to send you the ENTIRE URL or just the 'code' parameter")
    print()
    print("Example URL they'll see:")
    print("  https://www.dropbox.com/1/oauth2/display_token?oauth_token=CODE_HERE")
    print("  OR")
    print("  http://localhost/?code=CODE_HERE")
    print()
    
    # Step 3: Get authorization code
    print_header("Step 3: Enter the Authorization Code They Send You")
    
    print("Waiting for the authorization code from the account owner...")
    print("(They need to click the link above and send you the code)\n")
    
    code = input("Enter the authorization code: ").strip()
    
    if not code:
        print("\n❌ Authorization code is required!")
        return
    
    # Step 4: Exchange code for tokens
    print_header("Step 4: Exchanging Code for Refresh Token")
    
    data = {
        'code': code,
        'grant_type': 'authorization_code',
        'client_id': client_id,
        'client_secret': client_secret
    }
    
    print("Requesting refresh token from Dropbox...\n")
    
    response = make_request('https://api.dropboxapi.com/oauth2/token', data=data)
    
    if response['status'] != 200:
        print("❌ Error getting refresh token:")
        print(json.dumps(response['data'], indent=2))
        print("\nCommon issues:")
        print("• Code already used (each code works only once)")
        print("• Code expired (they expire quickly - ask for a new one)")
        print("• Wrong Client ID/Secret")
        print("• Code copied incorrectly (check for extra spaces/characters)")
        return
    
    tokens = response['data']
    
    if 'refresh_token' not in tokens:
        print("❌ No refresh token in response!")
        print("Did you use token_access_type=offline in the URL?")
        print(json.dumps(tokens, indent=2))
        return
    
    # Success!
    print("✅ Success! Got refresh token.\n")
    
    print_header("Your Tokens")
    
    print("Refresh Token (use this in production):")
    print(f"  {tokens['refresh_token']}\n")
    
    print("Access Token (expires in " + str(tokens['expires_in']) + " seconds):")
    print(f"  {tokens['access_token']}\n")
    
    if 'account_id' in tokens:
        print(f"Account ID: {tokens['account_id']}\n")
    
    # Save tokens
    save_tokens(tokens, client_id, client_secret)
    
    # Show .env instructions
    print_header("Step 5: Update Your .env.local")
    
    print("Add these to your maclellanfamily.com/.env.local file:\n")
    print(f"DROPBOX_CLIENT_ID={client_id}")
    print(f"DROPBOX_CLIENT_SECRET={client_secret}")
    print(f"DROPBOX_REFRESH_TOKEN={tokens['refresh_token']}")
    print("\n# Remove or comment out DROPBOX_ACCESS_TOKEN (it expires!)")
    print("# DROPBOX_ACCESS_TOKEN=...\n")
    
    # Test token
    print_header("Step 6: Test the Refresh Token")
    
    test_choice = input("Do you want to test the refresh token now? (y/n): ").strip().lower()
    
    if test_choice == 'y':
        success = test_refresh_token(client_id, client_secret, tokens['refresh_token'])
        if not success:
            return
    
    # Final instructions
    print_header("✅ All Done!")
    
    print("Next steps:")
    print("1. Copy the env vars to maclellanfamily.com/.env.local")
    print("2. Restart your dev server (npm run dev)")
    print("3. Your app will now use refresh tokens (never expire!)")
    print("4. The Dropbox account owner's photos will sync to your app\n")
    
    print("📁 Files created:")
    print("  • dropbox-tokens.json - Complete token info")
    print("  • dropbox-refresh-token.txt - Just the refresh token")
    print("  • dropbox-env-snippet.txt - Ready to paste in .env\n")
    
    print("🔒 Security reminder:")
    print("  • Keep these files secret (already in .gitignore)")
    print("  • Don't share the refresh token or client secret")
    print("  • The account owner is trusting YOU with access to their Dropbox\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Script cancelled by user.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

