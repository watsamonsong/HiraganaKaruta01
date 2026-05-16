# Publish Hiragana Karuta Online

This project is ready for Firebase Hosting.

## Files already configured

- `firebase.json` tells Firebase Hosting to publish this folder.
- `.firebaserc` points to the Firebase project `hiraganakaruta01`.
- `database.rules.json` contains simple public room rules for the Realtime Database.

## Deploy with Firebase CLI

From this folder:

```powershell
firebase login
firebase deploy --only hosting,database
```

After deployment, the public game URL should be:

```text
https://hiraganakaruta01.web.app
```

Firebase Hosting also usually provides:

```text
https://hiraganakaruta01.firebaseapp.com
```

## Why localhost did not work for everyone

`127.0.0.1` and `localhost` only mean the current device. They are good for testing on this computer, but people on other phones, tablets, or networks cannot open that address.

Firebase Hosting puts the same files online with HTTPS so anyone can open the public URL and play.

## Important note

The current database rules are open so guests can play without accounts. That is simple for a public demo game, but for a production game you should add Firebase Authentication and stricter room rules.
