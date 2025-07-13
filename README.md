DnT Clockwork Banker: Discord Bot

This guide provides comprehensive instructions to set up and run the DnT Clockwork Banker Discord bot. This bot streamlines guild bank item requests, manages new member stimulus claims, and provides essential communication tools within your Discord server.

Features

    Streamlined Item Requests: Members can use a user-friendly modal (pop-up form) to request multiple items, ensuring standardized request formats for bank staff.

    Persistent Banker Actions: Staff interaction buttons (Mark Fulfilled, Deny Request, Manage Items) appear on a dedicated message in the request thread.

    Partial Fulfillment Tracking: Staff can mark individual items as fulfilled via a dropdown menu, with automatic status updates (PARTIALLY FULFILLED, FULLY FULFILLED).

    Automated Status Updates: Requests are updated in real-time in Discord threads (via new status messages and name changes) and DMs to the requester.

    New Member Stimulus: New members can claim a one-time plat stimulus, tracked via Firebase and managed by authorized staff with role assignment.

    Role-Based Permissions: Restricts sensitive actions to designated staff roles.

    Firebase Integration: Uses Google Firestore for robust data storage and retrieval of requests and stimulus claims.

Prerequisites

Before you begin, ensure you have the following installed on your machine (Raspberry Pi recommended for hosting):

    Git: For cloning the repository.

        Download Git

    Node.js (LTS version): The JavaScript runtime environment. npm (Node Package Manager) comes with Node.js.

        Download Node.js (Choose the LTS version)

        Recommended for Linux (like RPi): Use nvm (Node Version Manager) for easy installation and management:
        Bash

        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        source ~/.bashrc # or ~/.zshrc
        nvm install --lts
        nvm use --lts
        nvm alias default --lts

Step-by-Step Setup

Follow these instructions to get the DnT Clockwork Banker bot up and running.

1. Clone the Repository

First, get a copy of the bot's code to your local machine (e.g., your Raspberry Pi):
Bash

git clone https://github.com/grumpy-gaming/DnT-ClockworkBanker-Bot.git
cd DnT-ClockworkBanker-Bot

(If you renamed your local folder, navigate to that one.)

2. Install Dependencies

Install all the required Node.js packages:
Bash

npm install

3. Discord Bot Application Setup

Your bot needs to be registered with Discord and invited to your server.

    Create a New Bot Application:

        Go to the Discord Developer Portal.

        Click "New Application". Give it a name (e.g., DnT_ClockworkBanker).

        Go to the "Bot" tab on the left sidebar.

        Click "Add Bot" -> "Yes, do it!".

        Crucial: Under "Privileged Gateway Intents", enable MESSAGE CONTENT INTENT and PRESENCE INTENT. Click "Save Changes".

        Copy the Token: Under "Token", click "Reset Token" (if it's new) and then "Copy". KEEP THIS TOKEN SECRET!

    Get Application ID:

        Go to the "General Information" tab (still in Developer Portal).

        Copy the "Application ID".

    Invite Your Bot to Your Guild:

        Go to the "OAuth2" -> "URL Generator" tab.

        Under "SCOPES", select bot and applications.commands.

        Under "BOT PERMISSIONS", check the following (these are minimum recommendations):

            General Permissions: Manage Channels (for creating threads), Manage Roles (for stimulus), Send Messages, Read Message History, Use Application Commands, Add Reactions.

            Thread Permissions: Create Public Threads, Send Messages in Threads, Manage Threads.

        Copy the generated URL. Paste it into your web browser, select your Discord guild, and click "Authorize".

4. Firebase Project Setup (for Bot Data)

Your bot uses Google Firestore to store item requests, stimulus claims, and other operational data.

    Create a New Firebase Project:

        Go to the Firebase Console.

        Click "Add project".

        Give it a name (e.g., DnT-BankerBot-Data). Follow the steps (Google Analytics not strictly necessary for this bot).

    Enable Firestore Database:

        Once the project is created, navigate to "Firestore Database" in the left sidebar under "Build".

        Click "Create database".

        Choose "Start in production mode".

        Select your desired location (e.g., nam5 (us-central) or closest to your hosting). Click "Enable".

    Generate Service Account Key (Crucial for Bot Access):

        In your new Firebase project, go to Project settings (gear icon next to "Project Overview").

        Go to the Service accounts tab.

        Under "Firebase Admin SDK", click "Generate new private key."

        A JSON file will be downloaded. Rename it to bot-firebase-key.json (or similar). KEEP THIS FILE ABSOLUTELY SECURE AND PRIVATE.

5. Configuration (.env File)

The bot uses an .env file to store sensitive credentials and Discord IDs.

    Create a firebase-keys folder in your bot's root directory:
    Bash

mkdir firebase-keys

Securely transfer your bot-firebase-key.json into this firebase-keys folder on your RPi. (e.g., using scp from your desktop: scp "path/to/bot-firebase-key.json" user@your_rpi_ip:/path/to/DnT-ClockworkBanker-Bot/firebase-keys/).

Create a .env file in the root of your DnT-ClockworkBanker-Bot directory:
Bash

    nano .env

    Paste the following content into .env, replacing the placeholders with your actual IDs and token:

    DISCORD_TOKEN="YOUR_BOT_TOKEN_HERE"
    DISCORD_GUILD_ID="YOUR_DISCORD_SERVER_ID_HERE"
    DISCORD_APPLICATION_ID="YOUR_BOT_APPLICATION_ID_HERE"

    # Path to your Firebase Service Account JSON file (relative to bot's root)
    FIREBASE_BOT_KEY_PATH="./firebase-keys/bot-firebase-key.json"

        DISCORD_TOKEN: The Bot Token you copied from the Discord Developer Portal.

        DISCORD_GUILD_ID: Your Discord Server's ID. (Enable Developer Mode in Discord: User Settings -> Advanced -> Developer Mode. Right-click on your server's name -> Copy ID).

        DISCORD_APPLICATION_ID: The Application ID you copied from the Developer Portal.

    Save the .env file (Ctrl+X, Y, Enter in nano).

        NEVER share this file or commit it to Git! It's already included in .gitignore.

6. Run the Bot

Now you're ready to start the DnT Clockwork Banker bot!
Bash

node index.js

The bot should log in successfully and be online in your Discord server.

Usage

Once the bot is online:

    Summon the main menu: Type /bank in any channel.

    View Guild Bank Website: Click this button to browse items.

    Make an Item Request: Click this to open a modal form.

        Remember: Specify the request type (e.g., "Crafting", "Faction Turn-In") in the "Additional Notes" field.

    Request New Member Stimulus: Click this to claim a one-time plat bonus.

    Staff Actions: (Requires authorized staff role)

        On an item request post, bank staff can use the Mark Fulfilled, Deny Request, and Manage Items buttons.

        "Manage Items" allows marking specific items as delivered, leading to PARTIALLY FULFILLED status.

        "Mark Fulfilled" or completing all items via "Manage Items" will set the request to FULLY FULFILLED.

        Fulfilled and Denied requests will have their thread names updated ([FULFILLED], [DENIED]) and the original message reacted with ✅ (for fulfilled).

Troubleshooting

    Bot not coming online / SyntaxError / Cannot find module:

        Ensure all Node.js dependencies are installed (npm install).

        Double-check every character of the code you pasted into index.js.

        Verify your .env file has all correct IDs and paths, and no typos.

    FirebaseAppError / Missing Access for Firebase:

        Ensure your bot-firebase-key.json is in the correct firebase-keys/ path and is valid JSON.

        Verify Firestore Database is enabled in your Firebase project.

    DiscordAPIError[50001]: Missing Access:

        Role Permissions: The bot lacks necessary Discord permissions. Go to Discord Developer Portal -> Your Bot -> OAuth2 -> URL Generator. Ensure all required BOT PERMISSIONS (especially for Messages, Channels, Threads, Roles, and Reactions) are checked. Re-generate the URL and re-authorize the bot in your server.

        Role Hierarchy: For role management (like stimulus) or managing threads/messages, the bot's highest role must be positioned above the roles it's trying to manage/assign in your server's Server Settings -> Roles list.

    "Application did not respond" (on command or button click):

        The bot might not be running, or an error is occurring in its code that prevents it from responding within Discord's 3-second timeout. Check your RPi terminal for errors.

        Ensure Discord Gateway Intents are enabled in the Developer Portal.

    Commands not showing up:

        Verify DISCORD_GUILD_ID and DISCORD_APPLICATION_ID in .env are correct.

        Perform a hard refresh of your Discord client (Ctrl+R / Cmd+R).

    Checkmarks not appearing on original post / thread names not updating:

        This is often due to Discord API timing/caching issues with new forum threads. Ensure your bot has Add Reactions permission. The core functionality (Firebase/DMs) still works in this scenario.

Getting Help

If you encounter any issues not covered here, or need further assistance, please reach out to the bot maintainers in your guild or check the project's GitHub Issues (if you create issues there). Provide:

    Your operating system (e.g., Raspberry Pi OS).

    Node.js version (node -v).

    The exact steps you followed.

    Any error messages you received in your terminal.
    --- END README CONTENT ---

Instructions for you:

    Copy all the text between (and including) the --- START README CONTENT --- and --- END README CONTENT --- lines.

    Paste it directly into your README.md file (e.g., in GitHub's web editor, or into nano README.md on your RPi).

    Crucially: You will then need to manually add three backticks () on a new line at the very beginning of the content you pasted, and **three backticks** () on a new line at the very end of the content you pasted. Also, add the word markdown right after the first three backticks, like this:
    Markdown

# DnT Clockwork Banker: Discord Bot
... (all the content you pasted) ...
