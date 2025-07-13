// index.js

require('dotenv').config(); // Load environment variables from .env

const {
    Client,
    GatewayIntentBits,
    Partials,
    Routes,
    ActionRowBuilder,   // For building rows of components
    ButtonBuilder,      // For creating buttons
    ButtonStyle,        // For defining button appearance
    ModalBuilder,       // For creating pop-up forms
    TextInputBuilder,   // For creating text inputs within modals
    TextInputStyle,     // For defining text input styles (short, paragraph)
    MessageFlags,       // For using ephemeral flags
    StringSelectMenuBuilder,      // For creating string select menus
    StringSelectMenuOptionBuilder // For creating options within string select menus
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { GUILD_COMMANDS } = require('./commands'); // Import command definitions from commands.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path'); // For resolving paths to Firebase keys

// --- Configuration Constants ---
const config = {
    GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    BANK_REQUEST_FORUM_CHANNEL_ID: '1338612236859605072',
    GUILD_BANK_TAG_ID: '1338627478771728394',
    STIMULUS_CHANNEL_ID: '1388193773778895039',
    STIMULUS_CLAIMED_ROLE_ID: '1325675917141344267',
    // --- Authorized Staff Role IDs (New Banker Role ID) ---
    AUTHORIZED_STAFF_ROLES: ['1380709191517212723'], // Single Banker Staff Role ID
    FIREBASE_BOT_KEY_PATH: process.env.FIREBASE_BOT_KEY_PATH || path.resolve(__dirname, 'firebase-keys', 'bot-firebase-key.json'),
    GUILD_BANK_WEBSITE_URL: 'https://thj-dnt.web.app/bank'
};

// --- Firebase Initialization ---
let botDb;

try {
    const botServiceAccountPath = config.FIREBASE_BOT_KEY_PATH;
    console.log(`[DEBUG] Attempting to load bot service account from: ${botServiceAccountPath}`);
    const botServiceAccount = require(botServiceAccountPath);
    console.log('[DEBUG] Bot Service Account JSON loaded successfully.');

    console.log('[DEBUG] Calling initializeApp for botApp...');
    const botAppInstance = initializeApp({
        credential: cert(botServiceAccount),
        ignoreUndefinedProperties: true // This allows Firestore to ignore 'undefined' values
    }, 'botApp');

    if (!botAppInstance) {
        throw new Error('Firebase initializeApp returned null or undefined. Initialization failed silently.');
    }
    console.log('[DEBUG] initializeApp for botApp seemingly successful. App instance:', botAppInstance.name);

    console.log('[DEBUG] Attempting to get Firestore instance from the specific app instance...');
    botDb = getFirestore(botAppInstance);
    console.log('Bot\'s Firebase project initialized successfully.');

} catch (error) {
    console.error('Failed to initialize bot\'s Firebase project. Make sure FIREBASE_BOT_KEY_PATH is correct and the JSON is valid. Error details:', error);
    process.exit(1);
}


// --- Discord Bot Initialization ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageTyping
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// --- Helper function for permission checks ---
function isAuthorizedStaff(member, authorizedRoleIds) {
    if (!member || !authorizedRoleIds || authorizedRoleIds.length === 0) return false;
    return authorizedRoleIds.some(roleId => member.roles.cache.has(roleId));
}

// --- Discord Bot Event Handlers ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Bot is ready to go!');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.GUILD_ID),
            { body: GUILD_COMMANDS }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    console.log(`[DEBUG] Received an interaction! Type: ${interaction.type} (ID: ${interaction.id}) from ${interaction.user.tag}`);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        console.log(`[DEBUG] ChatInputCommand received: /${commandName} from ${interaction.user.tag}`);

        if (commandName === 'ping') {
            await interaction.reply('Pong!');
        } else if (commandName === 'bank') {
            console.log(`Received /${commandName} command from ${interaction.user.tag}`);

            const makeRequestButton = new ButtonBuilder()
                .setCustomId('make_item_request')
                .setLabel('Make an Item Request')
                .setStyle(ButtonStyle.Primary);

            const viewWebsiteButton = new ButtonBuilder()
                .setURL(config.GUILD_BANK_WEBSITE_URL)
                .setLabel('View Guild Bank Website')
                .setStyle(ButtonStyle.Link);

            const stimulusButton = new ButtonBuilder()
                .setCustomId('request_stimulus')
                .setLabel('Request New Member Stimulus')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder()
                .addComponents(viewWebsiteButton, makeRequestButton, stimulusButton); // Ordered as requested

            await interaction.reply({
                content: '**__Guild Bank Information & Actions__**\n\n' +
                         'Welcome! To access the Guild Bank, please:\n\n' +
                         '• **View Guild Bank Website** first to see available items.\n' +
                         '• Then, use **Make an Item Request** below to submit your personalized request.\n' +
                         '• New members can also claim **New Member Stimulus**.',
                components: [row],
                ephemeral: false
            });

            console.log('Sent Guild Bank info message with buttons.');

        }
    } else if (interaction.isButton()) {
        console.log(`[DEBUG] Button clicked: ${interaction.customId} by ${interaction.user.tag}`);

        // --- Permission Check for Staff Buttons ---
        if (interaction.customId.startsWith('request_') || interaction.customId === 'manage_items' || interaction.customId.startsWith('stimulus_mark_paid_')) {
            const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id);
            if (!isAuthorizedStaff(member, config.AUTHORIZED_STAFF_ROLES)) {
                await interaction.reply({ content: 'You do not have permission to use this action.', flags: MessageFlags.Ephemeral });
                console.warn(`[WARNING] Unauthorized staff action attempt by ${interaction.user.tag} on customId: ${interaction.customId}`);
                return;
            }
        }


        if (interaction.customId === 'make_item_request') {
            const modal = new ModalBuilder()
                .setCustomId('item_request_modal')
                .setTitle('Guild Bank Item Request');

            const itemsInput = new TextInputBuilder()
                .setCustomId('itemsInput')
                .setLabel("Items To Request (One Per Line)")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g.,\n1x Flowing Black Silk Sash\n2x Orb of the Infinite Void\n1x Shield of the Immaculate')
                .setRequired(true)
                .setMinLength(1);

            const characterNameInput = new TextInputBuilder()
                .setCustomId('characterNameInput')
                .setLabel("Character Name (Where To Send Items)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Grumpytoon')
                .setRequired(true)
                .setMinLength(1);

            const additionalNotesInput = new TextInputBuilder()
                .setCustomId('additionalNotesInput')
                .setLabel("Additional Notes (Optional)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder('e.g., Available after 5pm EST, please parcel');

            const firstActionRow = new ActionRowBuilder().addComponents(itemsInput);
            const secondActionRow = new ActionRowBuilder().addComponents(characterNameInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(additionalNotesInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

            console.log('[DEBUG] Modal object created, attempting to show modal.');
            await interaction.showModal(modal);
            console.log(`Modal 'item_request_modal' shown to ${interaction.user.tag}`);

        } else if (interaction.customId === 'request_stimulus') {
            // New Member Stimulus Request
            console.log(`[DEBUG] Handling 'Request New Member Stimulus' button clicked by ${interaction.user.tag}`);

            const stimulusDocRef = botDb.collection('stimulusClaims').doc(interaction.user.id);
            const stimulusDoc = await stimulusDocRef.get();

            if (stimulusDoc.exists) {
                await interaction.reply({ content: 'You have already received your new member stimulus. This is a one-time claim per account.', flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deferUpdate();

            try {
                const officerChannel = await client.channels.fetch(config.STIMULUS_CHANNEL_ID);
                if (!officerChannel) {
                    console.error(`Error: Stimulus Officer Channel (ID: ${config.STIMULUS_CHANNEL_ID}) not found.`);
                    await interaction.followUp({ content: 'There was an error finding the officer channel for stimulus. Please contact a bot administrator.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const markPaidButton = new ButtonBuilder()
                    .setCustomId(`stimulus_mark_paid_${interaction.user.id}`)
                    .setLabel('Mark Paid')
                    .setStyle(ButtonStyle.Success);

                const buttonRow = new ActionRowBuilder().addComponents(markPaidButton);

                const officerMessage = await officerChannel.send({
                    content: `**New Member Stimulus Request!**\n` +
                             `**Requester:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                             `**Click 'Mark Paid' when plat has been delivered in-game.**`,
                    components: [buttonRow]
                });

                await stimulusDocRef.set({
                    requesterId: interaction.user.id,
                    requesterUsername: interaction.user.username,
                    officerMessageId: officerMessage.id,
                    status: 'pending',
                    timestamp: new Date(),
                    officerChannelId: config.STIMULUS_CHANNEL_ID,
                });

                await interaction.followUp({ content: 'Your new member stimulus request has been sent to an officer. Please wait for them to process it in-game.', flags: MessageFlags.Ephemeral });
                console.log(`Stimulus request from ${interaction.user.tag} sent to officer channel.`);

            } catch (error) {
                console.error(`[ERROR] Failed to process stimulus request for ${interaction.user.tag}:`, error);
                await interaction.followUp({ content: 'There was an error processing your stimulus request. Please try again later or contact a bot administrator.', flags: MessageFlags.Ephemeral });
            }

        } else if (interaction.customId === 'request_fulfilled') {
            console.log(`[DEBUG] Handling 'Mark Fulfilled' button clicked by ${interaction.user.tag}`);

            const fulfillModal = new ModalBuilder()
                .setCustomId('fulfill_request_modal')
                .setTitle('Mark Request Fulfilled');

            const fulfillMessageInput = new TextInputBuilder()
                .setCustomId('fulfillMessageInput')
                .setLabel("Message to Requester (Optional)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder('e.g., Your items have been delivered! Enjoy!');

            const actionRow = new ActionRowBuilder().addComponents(fulfillMessageInput);
            fulfillModal.addComponents(actionRow);

            await interaction.showModal(fulfillModal);
            console.log(`Modal 'fulfill_request_modal' shown to ${interaction.user.tag}`);

        } else if (interaction.customId === 'request_partial') { // Keeping this placeholder for robustness, though button removed
            console.log(`[DEBUG] Handling 'Send Partial Update' button clicked by ${interaction.user.tag}`);
            await interaction.reply({ content: 'Partial fulfillment logic is handled by "Manage Items" button, or not yet implemented.', flags: MessageFlags.Ephemeral });
        } else if (interaction.customId === 'request_deny') {
            console.log(`[DEBUG] Handling 'Deny Request' button clicked by ${interaction.user.tag}`);
            const denyModal = new ModalBuilder()
                .setCustomId('deny_request_modal')
                .setTitle('Deny Request');

            const denyMessageInput = new TextInputBuilder()
                .setCustomId('denyMessageInput')
                .setLabel("Reason for Denial (Required)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMinLength(10)
                .setPlaceholder('e.g., Items out of stock, character not valid, etc.');

            const actionRow = new ActionRowBuilder().addComponents(denyMessageInput);
            denyModal.addComponents(actionRow);

            await interaction.showModal(denyModal);
            console.log(`Modal 'deny_request_modal' shown to ${interaction.user.tag}`);

        } else if (interaction.customId === 'manage_items') {
            console.log(`[DEBUG] Handling 'Manage Items' button clicked by ${interaction.user.tag}`);

            await interaction.deferUpdate();

            const threadId = interaction.channel.id;

            try {
                const requestRef = botDb.collection('itemRequests').doc(threadId);
                const requestDoc = await requestRef.get();

                if (!requestDoc.exists) {
                    await interaction.followUp({ content: 'Could not find this request in the database. It might have been fulfilled or denied already.', flags: MessageFlags.Ephemeral });
                    console.warn(`[WARNING] Request document not found for Manage Items: ${threadId}`);
                    return;
                }

                const requestData = requestDoc.data();
                const pendingItems = requestData.items.filter(item => !item.fulfilled);

                if (pendingItems.length === 0) {
                    await interaction.followUp({ content: 'All items in this request are already marked as fulfilled!', flags: MessageFlags.Ephemeral });
                    return;
                }

                const options = pendingItems.map((item, index) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(item.name)
                        .setValue(`${item.originalIndex}`) // Use item.originalIndex as value
                        .setDescription(`Current Status: ${item.fulfilled ? 'Fulfilled' : 'Pending'}`)
                );

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('manage_items_select')
                    .setPlaceholder('Select items to mark as fulfilled...')
                    .addOptions(options)
                    .setMinValues(1)
                    .setMaxValues(options.length); // Allow selecting multiple items

                const row = new ActionRowBuilder()
                    .addComponents(selectMenu);

                await interaction.followUp({
                    content: `**Select Items to Mark as Fulfilled for ${requestData.characterName}:**`,
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
                console.log(`[DEBUG] Select menu for 'Manage Items' shown to ${interaction.user.tag} for thread ${threadId}.`);

            } catch (error) {
                console.error(`[ERROR] Failed to show Manage Items select menu for thread ${threadId}:`, error);
                await interaction.followUp({ content: 'There was an error preparing the item management menu. Please check logs.', flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.customId.startsWith('stimulus_mark_paid_')) { // Handle Mark Paid button for stimulus
            console.log(`[DEBUG] Handling 'Mark Paid' stimulus button clicked by ${interaction.user.tag}`);
            
            const userId = interaction.customId.split('_')[3];

            await interaction.deferUpdate();

            try {
                const guild = interaction.guild;
                const member = await guild.members.fetch(userId);
                const role = await guild.roles.fetch(config.STIMULUS_CLAIMED_ROLE_ID);

                if (member && role) {
                    await member.roles.add(role);
                    console.log(`[DEBUG] Added role ${role.name} to ${member.user.tag}.`);
                } else {
                    console.warn(`[WARNING] Could not find member (${userId}) or role (${config.STIMULUS_CLAIMED_ROLE_ID}) for stimulus assignment.`);
                }

                const stimulusDocRef = botDb.collection('stimulusClaims').doc(userId);
                await stimulusDocRef.update({
                    status: 'paid',
                    paidBy: interaction.user.id,
                    paidByUsername: interaction.user.username,
                    paidTimestamp: new Date(),
                });
                console.log(`[DEBUG] Stimulus claim for ${userId} marked as 'paid' in Firebase.`);

                await interaction.editReply({
                    content: `**New Member Stimulus Request!**\n` +
                             `**Requester:** <@${userId}> \n` +
                             `**Status: __PAID__ by <@${interaction.user.id}>!**`,
                    components: []
                });
                console.log(`[DEBUG] Stimulus officer message updated for ${userId}.`);

                const requester = await client.users.fetch(userId);
                if (requester) {
                    await requester.send(`Your new member stimulus of 5000p has been processed by ${interaction.user.tag}! Thank you for joining.`);
                    console.log(`[DEBUG] DM sent to requester ${requester.tag} for stimulus.`);
                }

            } catch (error) {
                console.error(`[ERROR] Failed to process stimulus Mark Paid button for user ${userId}:`, error);
                await interaction.followUp({ content: 'There was an error marking stimulus as paid. Please check logs.', flags: MessageFlags.Ephemeral });
            }
        }
    } // End of else if (interaction.isButton())
    
    else if (interaction.isModalSubmit()) { // Start of modal submission handling
        console.log(`[DEBUG] Modal submitted: ${interaction.customId} by ${interaction.user.tag}`);

        console.log(`[DEBUG] EXACT customId received from modal: "${interaction.customId}"`);

        // Handle submission of the initial item request modal
        if (interaction.customId === 'item_request_modal') {
            const itemsRequested = interaction.fields.getTextInputValue('itemsInput');
            const characterName = interaction.fields.getTextInputValue('characterNameInput');
            const additionalNotes = interaction.fields.getTextInputValue('additionalNotesInput');

            console.log(`[DEBUG] Items Requested: \n${itemsRequested}`);
            console.log(`[DEBUG] Character Name: ${characterName}`);
            console.log(`[DEBUG] Additional Notes: ${additionalNotes}`);

            await interaction.reply({ content: 'Your item request has been submitted!', flags: MessageFlags.Ephemeral });

            console.log(`[DEBUG] Attempting to fetch forum channel with ID: ${config.BANK_REQUEST_FORUM_CHANNEL_ID}`);
            const forumChannel = await client.channels.fetch(config.BANK_REQUEST_FORUM_CHANNEL_ID);

            if (!forumChannel) {
                console.error(`Error: Bank Request Forum Channel (ID: ${config.BANK_REQUEST_FORUM_CHANNEL_ID}) not found.`);
                await interaction.followUp({ content: 'There was an error finding the request forum channel (channel not found). Please contact a bot administrator.', flags: MessageFlags.Ephemeral });
                return;
            }
            if (!forumChannel.isThreadOnly()) { // isThreadOnly() checks if it's a Forum channel
                console.error(`Error: Channel ID ${config.BANK_REQUEST_FORUM_CHANNEL_ID} is not a Forum channel, but type is ${forumChannel.type}.`);
                await interaction.followUp({ content: 'There was an error finding the request forum channel (incorrect channel type). Please contact a bot administrator.', flags: MessageFlags.Ephemeral });
                return;
            }
            console.log(`[DEBUG] Forum channel found: ${forumChannel.name}. Type: ${forumChannel.type}`);

            let postContent = `**New Guild Bank Item Request!**\n\n` +
                              `**Requested by:** <@${interaction.user.id}>\n` + // Tag the requester
                              `**In-Game Character:** \`${characterName}\`\n\n` +
                              `**Requested Items:**\n`;

            const itemLines = itemsRequested.split('\n').map(line => `- ${line.trim()}`).join('\n');
            postContent += itemLines;

            if (additionalNotes) {
                postContent += `\n\n**Additional Notes:**\n${additionalNotes}`;
            }

            const tags = [config.GUILD_BANK_TAG_ID];
            console.log(`[DEBUG] Attempting to create forum thread with name: "Item Request from ${interaction.user.username} (${characterName})" and tags: ${tags.join(', ')}`);

            try {
                const newThread = await forumChannel.threads.create({
                    name: `Item Request from ${interaction.user.username} (${characterName})`, // Thread title
                    message: {
                        content: postContent,
                    },
                    appliedTags: tags,
                });
                console.log(`Created new forum thread for item request: ${newThread.url}`);

                let initialMessageId = null; 
                if (newThread.firstMessageId) {
                    initialMessageId = newThread.firstMessageId;
                    console.log(`[DEBUG] Initial message ID from newThread.firstMessageId: ${initialMessageId}.`);
                } else if (newThread.message && newThread.message.id) {
                    initialMessageId = newThread.message.id;
                    console.log(`[DEBUG] Initial message ID from newThread.message: ${initialMessageId}.`);
                } else {
                    console.warn(`[WARNING] Both newThread.firstMessageId and newThread.message.id were undefined for thread ${newThread.id}. InitialMessageId will be null in Firebase.`);
                }
                console.log(`[DEBUG] Final initial message ID to store: ${initialMessageId} for thread ${newThread.id}.`);

                console.log(`[DEBUG] Attempting to store request in Firebase for thread ID: ${newThread.id}`);
                const requestRef = botDb.collection('itemRequests').doc(newThread.id);
                
                const itemsToStore = itemsRequested.split('\n').map((item, idx) => ({ 
                    name: item.trim(), 
                    fulfilled: false, 
                    originalIndex: idx // Store original index here
                }));

                await requestRef.set({
                    threadId: newThread.id,
                    initialMessageId: initialMessageId, // Store null if ID could not be reliably obtained
                    requesterId: interaction.user.id,
                    requesterUsername: interaction.user.username,
                    characterName: characterName,
                    items: itemsToStore,
                    notes: additionalNotes,
                    status: 'pending',
                    timestamp: new Date(),
                    threadUrl: newThread.url,
                });
                console.log(`Item request stored in Firebase for thread ID: ${newThread.id}. Initial message ID: ${initialMessageId}`);

                console.log(`[DEBUG] Preparing staff action buttons for thread ${newThread.id}.`);

                const fulfilledButton = new ButtonBuilder()
                    .setCustomId('request_fulfilled')
                    .setLabel('Mark Fulfilled')
                    .setStyle(ButtonStyle.Success);

                const denyButton = new ButtonBuilder()
                    .setCustomId('request_deny')
                    .setLabel('Deny Request')
                    .setStyle(ButtonStyle.Danger);

                const manageItemsButton = new ButtonBuilder()
                    .setCustomId('manage_items')
                    .setLabel('Manage Items')
                    .setStyle(ButtonStyle.Secondary);

                const staffRow = new ActionRowBuilder()
                    .addComponents(fulfilledButton, denyButton, manageItemsButton);

                try {
                    const buttonsMessage = await newThread.send({
                        content: '**Banker Actions:**',
                        components: [staffRow]
                    });
                    console.log(`Staff action buttons sent as a new message to thread ${newThread.id}. Message ID: ${buttonsMessage.id}`);
                    
                    await requestRef.update({
                        buttonsMessageId: buttonsMessage.id // Store the ID of the message holding the buttons
                    });
                    console.log(`[DEBUG] Buttons message ID stored in Firebase for thread ${newThread.id}.`);

                } catch (sendButtonsError) {
                    console.error(`[ERROR] Failed to send staff action buttons as a new message to thread ${newThread.id}. Discord API Error:`, sendButtonsError);
                }

            } catch (error) {
                console.error('Error creating forum post or saving to Firebase:', error);
                let errorMessage = 'There was an error processing your request.';
                if (error.code === 50001) {
                    errorMessage += ' Bot lacks permissions in the target channel.';
                } else if (error.code === 10003) {
                    errorMessage += ' Target channel not found.';
                } else if (error.message && error.message.includes('Invalid Form Body')) {
                    errorMessage += ` Invalid data for Discord API. Details: ${error.message}`;
                } else if (error.name === 'DiscordAPIError[50035]') { // Invalid Form Body
                     errorMessage += ` Invalid data for Discord API. Details: ${error.message}`;
                }
                await interaction.followUp({ content: `${errorMessage} Please try again later or contact a bot administrator.`, flags: MessageFlags.Ephemeral });
            }

        } // End of if (interaction.customId === 'item_request_modal')
        
        else if (interaction.customId === 'fulfill_request_modal') {
            const fulfillMessage = interaction.fields.getTextInputValue('fulfillMessageInput');
            console.log(`[DEBUG] Fulfilled message input: "${fulfillMessage}"`);

            await interaction.deferUpdate();

            const threadId = interaction.channel.id;
            const staffMemberId = interaction.user.id;
            const staffMemberTag = interaction.user.tag;

            try {
                const requestRef = botDb.collection('itemRequests').doc(threadId);
                const requestDoc = await requestRef.get();
                let requestData = {};

                if (requestDoc.exists) {
                    requestData = requestDoc.data();
                    console.log(`[DEBUG] Fetched request data from Firebase for thread ${threadId}.`);
                } else {
                    console.warn(`[WARNING] Request document not found in Firebase for thread ${threadId}. Cannot proceed with fulfillment.`);
                    await interaction.followUp({ content: `Could not find request data in Firebase for this thread. Fulfillment aborted.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // --- Update the persistent buttons message ---
                if (requestData.buttonsMessageId) {
                    const buttonsMessage = await interaction.channel.messages.fetch(requestData.buttonsMessageId);
                    if (buttonsMessage) {
                        await buttonsMessage.edit({
                            content: `**Banker Actions: __FULLY FULFILLED__ by <@${staffMemberId}>!**`,
                            components: []
                        });
                        console.log(`[DEBUG] Persistent Banker Actions message updated to FULFILLED for thread ${threadId}.`);
                    } else {
                        console.warn(`[WARNING] Could not fetch buttonsMessage by ID ${requestData.buttonsMessageId} for thread ${threadId}.`);
                    }
                } else {
                    console.warn(`[WARNING] No buttonsMessageId found in Firebase for thread ${threadId}. Cannot update persistent buttons message.`);
                }

                await requestRef.update({
                    status: 'fulfilled',
                    fulfilledBy: staffMemberId,
                    fulfilledByUsername: staffMemberTag,
                    fulfilledMessage: fulfillMessage,
                    fulfilledTimestamp: new Date(),
                });
                console.log(`[DEBUG] Request status in Firebase updated to 'fulfilled' for thread ID: ${threadId}`);

                await interaction.channel.send({
                    content: `**Status Update:** Request marked **__FULLY FULFILLED__** by <@${staffMemberId}>. ` +
                             (fulfillMessage ? `**Banker's Message:** *"${fulfillMessage}"*` : ''),
                });
                console.log(`[DEBUG] Sent new status update message to thread ${threadId} for fulfillment.`);

                const requester = await client.users.fetch(requestData.requesterId);
                if (requester) {
                    let dmContent = `Your Guild Bank request for **${requestData.characterName}** has been **FULLY FULFILLED** by ${staffMemberTag}!\n`;
                    dmContent += `Request Link: ${requestData.threadUrl}\n`;
                    if (fulfillMessage) {
                        dmContent += `\n**Banker's Message:** *"${fulfillMessage}"*`;
                    }
                    await requester.send(dmContent);
                    console.log(`[DEBUG] DM sent to requester ${requester.tag} for thread ${threadId}.`);
                } else {
                    console.warn(`[WARNING] Could not fetch requester user for DM: ${requestData.requesterId}.`);
                }

                await interaction.followUp({ content: `Request for ${requestData.characterName || 'the requested character'} marked as FULFILLED. Requester has been notified.`, flags: MessageFlags.Ephemeral });

                // --- Lock and archive the thread --- (Removed as per user request)
                // if (interaction.channel.isThread()) {
                //     await interaction.channel.setLocked(true, 'Request Fulfilled');
                //     await interaction.channel.setArchived(true, 'Request Fulfilled');
                //     console.log(`[DEBUG] Thread ${threadId} locked and archived due to fulfillment.`);
                // } else {
                //     console.warn(`[WARNING] Channel ${threadId} is not a thread. Cannot lock/archive.`);
                // }
                // --- NEW: Update thread name instead of lock/archive ---
                if (interaction.channel.isThread()) {
                    await interaction.channel.setName(`[FULFILLED] ${requestData.characterName} - ${requestData.requesterUsername} (${requestData.threadId.substring(0, 4)}...)`);
                    console.log(`[DEBUG] Thread ${threadId} name updated to [FULFILLED].`);
                    // --- NEW: Add ✅ reaction to the original request message ---
                    if (requestData.initialMessageId) {
                        try {
                            const originalMessage = await interaction.channel.messages.fetch(requestData.initialMessageId);
                            await originalMessage.react('✅');
                            console.log(`[DEBUG] Added ✅ reaction to original message ${requestData.initialMessageId}.`);
                        } catch (reactError) {
                            console.error(`[ERROR] Failed to add ✅ reaction to message ${requestData.initialMessageId}:`, reactError);
                        }
                    } else {
                        console.warn(`[WARNING] No initialMessageId stored for thread ${threadId}. Cannot add reaction.`);
                    }
                } else {
                    console.warn(`[WARNING] Channel ${threadId} is not a thread. Cannot update name or add reaction.`);
                }


            } catch (error) {
                console.error(`[ERROR] Failed to process fulfill_request_modal for thread ${threadId}:`, error);
                await interaction.followUp({ content: `There was an error processing your fulfillment. Please check logs.`, flags: MessageFlags.Ephemeral });
            }
        } // End of else if (interaction.customId === 'fulfill_request_modal')
        
        // Handle submission of the deny request modal
        else if (interaction.customId === 'deny_request_modal') {
            const denyMessage = interaction.fields.getTextInputValue('denyMessageInput');
            console.log(`[DEBUG] Deny message input: "${denyMessage}"`);

            await interaction.deferUpdate();

            const threadId = interaction.channel.id;
            const staffMemberId = interaction.user.id;
            const staffMemberTag = interaction.user.tag;

            try {
                const requestRef = botDb.collection('itemRequests').doc(threadId);
                const requestDoc = await requestRef.get();
                let requestData = {};

                if (requestDoc.exists) {
                    requestData = requestDoc.data();
                    console.log(`[DEBUG] Fetched request data from Firebase for thread ${threadId}.`);
                } else {
                    console.warn(`[WARNING] Request document not found in Firebase for thread ${threadId}. Cannot proceed with denial.`);
                    await interaction.followUp({ content: `Could not find request data in Firebase for this thread. Denial aborted.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                // --- Update the persistent buttons message ---
                if (requestData.buttonsMessageId) {
                    const buttonsMessage = await interaction.channel.messages.fetch(requestData.buttonsMessageId);
                    if (buttonsMessage) {
                        await buttonsMessage.edit({
                            content: `**Banker Actions: __DENIED__ by <@${staffMemberId}>!**`,
                            components: []
                        });
                        console.log(`[DEBUG] Persistent Banker Actions message updated to DENIED for thread ${threadId}.`);
                    } else {
                        console.warn(`[WARNING] Could not fetch buttonsMessage by ID ${requestData.buttonsMessageId} for thread ${threadId}.`);
                    }
                } else {
                    console.warn(`[WARNING] No buttonsMessageId found in Firebase for thread ${threadId}. Cannot update persistent buttons message.`);
                }

                await requestRef.update({
                    status: 'denied',
                    deniedBy: staffMemberId,
                    deniedByUsername: staffMemberTag,
                    denialReason: denyMessage,
                    deniedTimestamp: new Date(),
                });
                console.log(`[DEBUG] Request status in Firebase updated to 'denied' for thread ID: ${threadId}`);

                await interaction.channel.send({
                    content: `**Status Update:** Request marked **__DENIED__** by <@${staffMemberId}>. ` +
                             (denyMessage ? `**Reason:** *"${denyMessage}"*` : ''),
                });
                console.log(`[DEBUG] Sent new status update message to thread ${threadId} for denial.`);

                const requester = await client.users.fetch(requestData.requesterId);
                if (requester) {
                    let dmContent = `Your Guild Bank request for **${requestData.characterName}** has been **DENIED** by ${staffMemberTag}!\n`;
                    dmContent += `Request Link: ${requestData.threadUrl}\n`;
                    if (denyMessage) {
                        dmContent += `\n**Reason for Denial:** *"${denyMessage}"*`;
                    }
                    await requester.send(dmContent);
                    console.log(`[DEBUG] DM sent to requester ${requester.tag} for denied thread ${threadId}.`);
                } else {
                    console.warn(`[WARNING] Could not fetch requester user for denied DM: ${requestData.requesterId}.`);
                }

                await interaction.followUp({ content: `Request for ${requestData.characterName || 'the requested character'} marked as DENIED. Requester has been notified.`, flags: MessageFlags.Ephemeral });

                // --- NEW: Update thread name instead of lock/archive ---
                if (interaction.channel.isThread()) {
                    await interaction.channel.setName(`[DENIED] ${requestData.characterName} - ${requestData.requesterUsername} (${requestData.threadId.substring(0, 4)}...)`);
                    console.log(`[DEBUG] Thread ${threadId} name updated to [DENIED].`);
                } else {
                    console.warn(`[WARNING] Channel ${threadId} is not a thread. Cannot update name.`);
                }


            } catch (error) {
                console.error(`[ERROR] Failed to process deny_request_modal for thread ${threadId}:`, error);
                await interaction.followUp({ content: `There was an error processing your denial. Please check logs.`, flags: MessageFlags.Ephemeral });
            }
        } // End of else if (interaction.customId === 'deny_request_modal')

    } // End of else if (interaction.isModalSubmit())
    
    else if (interaction.isStringSelectMenu()) { // Start of select menu handling
        console.log(`[DEBUG] Select menu chosen: ${interaction.customId} with values: ${interaction.values.join(', ')} by ${interaction.user.tag}`);

        if (interaction.customId === 'manage_items_select') {
            await interaction.deferUpdate();

            const threadId = interaction.channel.id;
            const staffMemberId = interaction.user.id;
            const staffMemberTag = interaction.user.tag;
            const selectedOriginalIndices = interaction.values.map(val => parseInt(val)); // Get the selected ORIGINAL indices as numbers

            try {
                const requestRef = botDb.collection('itemRequests').doc(threadId);
                const requestDoc = await requestRef.get();

                if (!requestDoc.exists) {
                    await interaction.followUp({ content: 'Could not find this request in the database. It might have been fulfilled or denied already.', flags: MessageFlags.Ephemeral });
                    console.warn(`[WARNING] Request document not found for select menu: ${threadId}`);
                    return;
                }
                let requestData = requestDoc.data();
                let currentItems = requestData.items;

                let itemsFulfilledNow = [];
                let remainingPendingItems = [];
                let allItemsFulfilled = true;

                currentItems = currentItems.map(item => {
                    if (selectedOriginalIndices.includes(item.originalIndex)) {
                        if (!item.fulfilled) {
                            itemsFulfilledNow.push(item.name);
                        }
                        return { ...item, fulfilled: true };
                    } else {
                        if (!item.fulfilled) {
                            remainingPendingItems.push(item.name);
                            allItemsFulfilled = false;
                        }
                        return item;
                    }
                });

                let newStatus = allItemsFulfilled ? 'fulfilled' : 'partially_fulfilled';

                await requestRef.update({
                    items: currentItems,
                    status: newStatus,
                    lastUpdatedBy: staffMemberId,
                    lastUpdatedTimestamp: new Date(),
                });
                console.log(`[DEBUG] Request items and status updated in Firebase for thread ${threadId}. New status: ${newStatus}. Items fulfilled this update: ${itemsFulfilledNow.length}`);

                // --- Update the persistent Banker Actions message ---
                if (requestData.buttonsMessageId) {
                    const buttonsMessage = await interaction.channel.messages.fetch(requestData.buttonsMessageId);
                    if (buttonsMessage) {
                        let bankerActionsContent;
                        let newButtons = [];

                        if (allItemsFulfilled) {
                            bankerActionsContent = `**Banker Actions: __FULLY FULFILLED__ by <@${staffMemberId}>!**`;
                        } else {
                            bankerActionsContent = `**Banker Actions: __PARTIALLY FULFILLED__ by <@${staffMemberId}>!**`;
                            const fulfilledButton = new ButtonBuilder()
                                .setCustomId('request_fulfilled')
                                .setLabel('Mark Fulfilled')
                                .setStyle(ButtonStyle.Success);

                            const denyButton = new ButtonBuilder()
                                .setCustomId('request_deny')
                                .setLabel('Deny Request')
                                .setStyle(ButtonStyle.Danger);

                            const manageItemsButton = new ButtonBuilder()
                                .setCustomId('manage_items')
                                .setLabel('Manage Items')
                                .setStyle(ButtonStyle.Secondary);

                            newButtons = [fulfilledButton, denyButton, manageItemsButton];
                        }

                        await buttonsMessage.edit({
                            content: bankerActionsContent,
                            components: newButtons.length > 0 ? [new ActionRowBuilder().addComponents(newButtons)] : []
                        });
                        console.log(`[DEBUG] Persistent Banker Actions message updated for thread ${threadId}. New status: ${newStatus}.`);
                    } else {
                        console.warn(`[WARNING] Could not fetch buttonsMessage by ID ${requestData.buttonsMessageId} for thread ${threadId}.`);
                    }
                } else {
                    console.warn(`[WARNING] No buttonsMessageId found in Firebase for thread ${threadId}. Cannot update persistent buttons message.`);
                }

                // --- Send a new status update message to the thread ---
                let threadUpdateContent;
                if (allItemsFulfilled) {
                    threadUpdateContent = `**Status Update:** Request marked **__FULLY FULFILLED__** by <@${staffMemberId}>!`;
                } else {
                    threadUpdateContent = `**Status Update:** Request marked **__PARTIALLY FULFILLED__** by <@${staffMemberId}>.\n\n` +
                                          `**Items delivered in this update:**\n${itemsFulfilledNow.map(name => `✅ ${name}`).join('\n') || 'None explicitly marked.'}\n\n`;
                    if (remainingPendingItems.length > 0) {
                        threadUpdateContent += `**Items still pending delivery:**\n${remainingPendingItems.map(name => `• ${name}`).join('\n')}`;
                    }
                }

                await interaction.channel.send({ content: threadUpdateContent });
                console.log(`[DEBUG] Sent new status update message to thread ${threadId} for select menu action.`);

                // 5. Send DM to original requester
                const requester = await client.users.fetch(requestData.requesterId);
                if (requester) {
                    let dmContent;
                    if (allItemsFulfilled) {
                        dmContent = `Your Guild Bank request for **${requestData.characterName}** has been **FULLY FULFILLED** by ${staffMemberTag}!\n`;
                        dmContent += `Request Link: ${requestData.threadUrl}\n\n`;
                        dmContent += `All requested items have now been delivered!`;
                    } else {
                        dmContent = `Your Guild Bank request for **${requestData.characterName}** has been **PARTIALLY FULFILLED** by ${staffMemberTag}!\n`;
                        dmContent += `Request Link: ${requestData.threadUrl}\n\n`;
                        dmContent += `**Items delivered in this update:**\n${itemsFulfilledNow.map(name => `✅ ${name}`).join('\n') || 'None explicitly marked.'}\n\n`;
                        if (remainingPendingItems.length > 0) {
                            dmContent += `**Items still pending delivery:**\n${remainingPendingItems.map(name => `• ${name}`).join('\n')}`;
                        }
                    }
                    
                    await requester.send(dmContent);
                    console.log(`[DEBUG] DM sent to requester ${requester.tag} for partial/full fulfillment of thread ${threadId}.`);
                } else {
                    console.warn(`[WARNING] Could not fetch requester user for DM in select menu handler: ${requestData.requesterId}.`);
                }

                await interaction.followUp({ content: `Items marked as fulfilled. Status updated to **${newStatus.toUpperCase().replace('_', ' ')}**. Requester notified.`, flags: MessageFlags.Ephemeral });

                // --- NEW: Update thread name and add reaction if all items are fulfilled ---
                if (allItemsFulfilled && interaction.channel.isThread()) {
                    await interaction.channel.setName(`[FULFILLED] ${requestData.characterName} - ${requestData.requesterUsername} (${requestData.threadId.substring(0, 4)}...)`);
                    console.log(`[DEBUG] Thread ${threadId} name updated to [FULFILLED].`);
                    // Add ✅ reaction to the original request message
                    if (requestData.initialMessageId) {
                        try {
                            const originalMessage = await interaction.channel.messages.fetch(requestData.initialMessageId);
                            await originalMessage.react('✅');
                            console.log(`[DEBUG] Added ✅ reaction to original message ${requestData.initialMessageId}.`);
                        } catch (reactError) {
                            console.error(`[ERROR] Failed to add ✅ reaction to message ${requestData.initialMessageId}:`, reactError);
                        }
                    } else {
                        console.warn(`[WARNING] No initialMessageId stored for thread ${threadId}. Cannot add reaction.`);
                    }
                } else if (!allItemsFulfilled && interaction.channel.isThread()) { // If partially fulfilled, update name to PARTIALLY FULFILLED
                    await interaction.channel.setName(`[PARTIALLY FULFILLED] ${requestData.characterName} - ${requestData.requesterUsername} (${requestData.threadId.substring(0, 4)}...)`);
                    console.log(`[DEBUG] Thread ${threadId} name updated to [PARTIALLY FULFILLED].`);
                } else if (!interaction.channel.isThread()) {
                    console.warn(`[WARNING] Channel ${threadId} is not a thread. Cannot update name or add reaction.`);
                }


            } catch (error) {
                console.error(`[ERROR] Failed to process manage_items_select for thread ${threadId}:`, error);
                await interaction.followUp({ content: 'There was an error processing your item selection. Please check logs.', flags: MessageFlags.Ephemeral });
            }
        } // End of if (interaction.customId === 'manage_items_select')
    } // End of else if (interaction.isStringSelectMenu())
});

// Login the bot to Discord
client.login(process.env.DISCORD_TOKEN);

// Export the Firebase instances and config for use in other modules
module.exports = {
    client,
    botDb,
    config,
};
