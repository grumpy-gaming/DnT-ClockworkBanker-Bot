// commands.js
// No specific Discord.js imports needed here yet for simple command definitions

const GLOBAL_COMMANDS = [
    // No global commands for now, we'll focus on guild commands for faster dev
];

const GUILD_COMMANDS = [
    {
        name: 'bank',
        description: 'Displays the Guild Bank information and actions.',
    },
    // Other commands like /request, /stimulus will be added here later
];

module.exports = {
    GLOBAL_COMMANDS,
    GUILD_COMMANDS
};
