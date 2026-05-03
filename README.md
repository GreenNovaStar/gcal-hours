# Work Hours Calculator

A simple web app that calculates your monthly work hours from Google Calendar. No server needed — runs entirely in the browser and can be hosted on GitHub Pages.

## How It Works

1. Sign in with your Google account
2. Pick a month
3. See your total hours (calculated from calendar events matching a keyword)

By default, it counts any event with "Work" in the title. You can change this in `config.js`.

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** (top bar) → **New Project**
3. Name it anything (e.g., "Work Hours Calculator") and click **Create**

### 2. Enable the Google Calendar API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **Google Calendar API**
3. Click it, then click **Enable**

### 3. Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in the required fields:
   - **App name**: Work Hours Calculator
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes**
   - Search for `Google Calendar API` and check `.../auth/calendar.events.readonly`
   - Click **Update**, then **Save and Continue**
6. On the **Test users** page, add the Google accounts that will use the app
   - While the app is in "Testing" mode, only these accounts can sign in
   - You can add up to 100 test users
7. Click **Save and Continue**, then **Back to Dashboard**

> **Note:** To let anyone sign in without being added as a test user, you'd need to submit the app for Google's verification. For personal/small team use, just add everyone as test users.

### 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Set **Application type** to **Web application**
4. Name it anything (e.g., "Work Hours Calculator")
5. Under **Authorized JavaScript origins**, add the URLs where you'll host the app:
   - For local testing: `http://localhost:8080` (or whatever port you use)
   - For GitHub Pages: `https://yourusername.github.io`
6. Click **Create**
7. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

### 5. Configure the App

Open `config.js` and replace the placeholder with your Client ID:

```js
const CONFIG = {
  CLIENT_ID: 'your-client-id-here.apps.googleusercontent.com',
  WORK_KEYWORD: 'Work',
};
```

## Running Locally

Any static file server works. For example:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx, no install needed)
npx serve -p 8080
```

Then open `http://localhost:8080` in your browser.

## Hosting on GitHub Pages

1. Create a GitHub repository
2. Push these files to the `main` branch
3. Go to **Settings** → **Pages**
4. Set source to **Deploy from a branch**, select `main`, and click **Save**
5. Your app will be live at `https://yourusername.github.io/repo-name/`
6. Make sure to add that URL to **Authorized JavaScript origins** in your Google Cloud credentials

## Event Format

The app looks for timed events (not all-day events) that contain the configured keyword in the title. For example, with the default keyword "Work":

- "Work" — counted
- "Work - Client Meeting" — counted
- "Workout" — counted (contains "work")
- "Team Lunch" — not counted

You can change the keyword in `config.js` to match your naming convention.
