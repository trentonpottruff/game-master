const utils = require('./utils');

const initializeChannels = async (server, category, prefix, bot) => {
    //Create the primary channel
    const controlChannel = await server.channels.create(`${prefix}-control`, {
        parent: category,
        permissionOverwrites: [
            {id: server.roles.everyone, deny: "VIEW_CHANNEL"},
            {id: bot.user.id, allow: "VIEW_CHANNEL"}
        ]
    });

    const primaryChannel = await server.channels.create(prefix, {
        parent: category,
        permissionOverwrites: [
            {id: server.roles.everyone, deny: "SEND_MESSAGES"}
        ]
    });

    const infoBoard = await server.channels.create(`${prefix}-infoboard`, {
        parent: category,
        permissionOverwrites: [
            {id: server.roles.everyone, deny: "SEND_MESSAGES"}
        ]
    });

    const scumChat = await server.channels.create(`${prefix}-scumchat`, {
        parent: category,
        permissionOverwrites: [
            {id: server.roles.everyone, deny: ["VIEW_CHANNEL", "SEND_MESSAGES"]},
            {id: bot.user.id, allow: "VIEW_CHANNEL"}
        ]
    });

    const deadChat = await server.channels.create(`${prefix}-deadchat`, {
        parent: category,
        permissionOverwrites: [
            {id: server.roles.everyone, deny: ["VIEW_CHANNEL", "SEND_MESSAGES"]},
            {id: bot.user.id, allow: "VIEW_CHANNEL"}
        ]
    });

    return {controlChannel, primaryChannel, infoBoard, scumChats: [scumChat], nightTalk: [], deadChat};
};
exports.initializeChannels = initializeChannels;

const nextPhase = (channel, prefix, game, bot, db) => {
    const mainChannel = bot.guilds.resolve(game.server).channels.resolve(game.channel);
    if (game.night) {
        game.day++;
        game.night = false;
        mainChannel.updateOverwrite(game.cache.playerRole, {
            SEND_MESSAGES: true
        }).then(channel => console.log(channel.permissionOverwrites)).catch(console.error);
        game.channels.scumChats.forEach(sc => {
            chat = channel.guild.channels.resolve(sc);
            if (!chat) return;
            chat.updateOverwrite(channel.guild.roles.everyone, {
                SEND_MESSAGES: false
            });
        });
        game.channels.nightTalk.forEach(nt => {
            chat = channel.guild.channels.resolve(nt);
            if (!chat) return;
            chat.updateOverwrite(channel.guild.roles.everyone, {
                SEND_MESSAGES: false
            });
        });
    } else {
        game.night = true;
        mainChannel.updateOverwrite(game.cache.playerRole, {
            SEND_MESSAGES: false
        }).catch(console.error);
        game.channels.scumChats.forEach(sc => {
            chat = channel.guild.channels.resolve(sc);
            chat.updateOverwrite(channel.guild.roles.everyone, {
                SEND_MESSAGES: true
            });
        });
        game.channels.nightTalk.forEach(nt => {
            chat = channel.guild.channels.resolve(sc);
            chat.updateOverwrite(channel.guild.roles.everyone, {
                SEND_MESSAGES: true
            });
        });
    }
    game.timeLeft.add(game.lengthOfDays, "seconds");
    game.votes = [];
    db.updateOne({_id: game._id}, {$set: {
        day: game.day,
        night: game.night,
        votes: game.votes,
        timeLeft: game.timeLeft.toDate()
    }}).then(result => console.log('~ Successfully updated game in DB!')).catch(console.error);
    mainChannel.send(`**${(game.night) ? "Night" : "Day"} ${game.day} has begun! You have *until the GM decides* to ${(game.night) ? "perform your night actions!**" : `chat and decide if you want to lynch.**\nUse \`${prefix}lynch @[player]\` to vote to lynch.\nOr \`/nolynch\` to vote to no lynch today.\n*${utils.votesToLynch(game)} votes needed to hammer.*`}`).catch(console.error);
};
exports.nextPhase = nextPhase;

exports.killPlayer = (game, player, db, server) => {
    const playerIndex = game.players.findIndex(value => value.id == player);
    if (playerIndex >= 0) {
        let playerObj = game.players[playerIndex];
        playerObj.alive = false;
        game.players[playerIndex] = playerObj; //Reset in local game array
        server.channels.resolve(game.channels.deadChat).updateOverwrite(player, {VIEW_CHANNEL: true, SEND_MESSAGES: true}); //Give deadchat perms
        if (playerObj.scum) {
            game.channels.scumChats.forEach(scumChatId => {
                server.channels.resolve(scumChatId).updateOverwrite(player, {SEND_MESSAGES: false}); //If scum, make sure they can't talk
            });
        }
        db.updateOne({_id: game._id}, {$set: {players: game.players}}).then(result => console.log('~ Successfully updated players in DB!')).catch(console.error);
        return true;
    }
    return false;
};