/// Base skeleton code by Danny (Lumpy)

const dotenv = require('dotenv');
dotenv.config();

// DISCORD SETUP
const Discord = require('discord.js');
const bot = new Discord.Client();

// MOMENT SETUP
const moment = require('moment');

// MONGODB SETUP
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const assert = require('assert');
const db_url = `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@ds135540.mlab.com:35540/game-master`;
const db_name = 'game-master';
var db;
var db_col_games;

// MISC
const token = process.env.TOKEN;
const prefix = "!";
var ready = false;

// CUSTOM MODULES
const databaseUtils = require('./database');

//Game variables
var activeGames = [];

bot.on('message', async msg=>{
    if (ready) {
        //Log message
        if (gameExists(msg.guild.id, msg.author.id) > 1) {
            console.log(`(${msg.guild.name})[#${msg.channel.name}] ${msg.author.tag}: ${msg.content}`);
        }

        //Handle message
        if(msg.content.startsWith(prefix)) { // Commandsa
            var parts = msg.content.split(' ');
            var mentions = msg.mentions.users.array();
            var command = parts[0].replace(prefix, "");
            var gameIndex = gameExists(msg.guild.id, msg.channel.id);
            var game = activeGames[gameIndex];

            if (command == 'start') {
                //Start a game if none is active in this channel
                if (gameIndex >= 0) { //Game already exists in this channel
                    //msg.author.send("A game already exists there silly goose.")
                    //Do nothing because Lumi is forcing me not to send DMs
                } else { //No game exist right now, go ahead and create
                    var newGame = {
                        type: "Mafia",
                        gm: msg.author.id,
                        server: msg.guild.id,
                        channel: msg.channel.id,
                        name: msg.channel.name,
                        currentMessage: null,
                        cache: {
                            playerRole: null,
                            gmRole: null
                        },
                        lengthOfDays: 30,
                        timeLeft: moment().add(30, 'seconds'),
                        day: 0,
                        night: false,
                        players: [],
                        votes: []
                    };

                    //Create player role
                    msg.guild.roles.create({
                        data: {name: `${msg.channel.name}-player`},
                        reason: `For the game started by ${msg.author.username}` 
                    }).then((playerRole) => {
                        //Give player role the proper permissions
                        newGame.cache.playerRole = playerRole;
                        msg.channel.updateOverwrite(playerRole, {
                            SEND_MESSAGES: true
                        }).catch(console.error);

                        //Create the GM role
                        msg.guild.roles.create({
                            data: {name: `${msg.channel.name}-gm`},
                            reason: `For the game started by ${msg.author.username}`
                        }).then((gmRole) => {
                            //Give GM role proper permissions
                            newGame.cache.gmRole = gmRole;
                            msg.channel.updateOverwrite(gmRole, {
                                SEND_MESSAGES: true
                            }).catch(console.error);
            
                            //Add GM role to GM
                            msg.member.roles.add(gmRole);
                            msg.guild.member(bot.user).roles.add(gmRole);
                            
                            //Let everyone know
                            msg.channel.send(new Discord.MessageEmbed().setDescription(`**SIGNUPS FOR MAFIA HAVE BEGUN!**\nType \`${prefix}join\` to join this fun game!`).addField('Time Left', formatMinutes(newGame.timeLeft.diff(moment(), 'seconds') / 60 - 1))).then(message => {
                                newGame.currentMessage = message;
                                console.log(newGame);
                                const serializedGame = databaseUtils.serializeGame(newGame);
                                console.log(serializedGame);
                            
                                db_col_games.insertOne(serializedGame).then((result) => {
                                    console.log('Game is now in DB!');
                                    newGame._id = result.ops[0]._id;
                                    console.log(newGame);
                                    activeGames.push(newGame);
                                }).catch((err) => {
                                    console.log("CRITICAL ERROR IN INSERTION!");
                                    console.log(err);
                                });
                            });
                        }).catch((reason) => {
                            msg.reply(new Discord.MessageEmbed().setTitle('ERROR: Couldn\'t create GM role!').setDescription('Sorry, I was unable to start the game due to an internal error. I was unable to create the GM role. Please kindly ask the server admin(s) if I have the proper permissions to create roles, pretty please?').setColor('#FF0000'));
                            console.log(reason);
                        });
                    }).catch((reason) => {
                        msg.reply(new Discord.MessageEmbed().setTitle('ERROR: Couldn\'t create player role!').setDescription('Sorry, I was unable to start the game due to an internal error. I was unable to create the player role. Please kindly ask the server admin(s) if I have the proper permissions to create roles, pretty please?').setColor('#FF0000'));
                        console.log(reason);
                    });
                }
            } else if (command == 'join') {
                //Join the current game active in the channel if available
                if (gameIndex >= 0) { //There is a game to join
                    var player = {
                        id: msg.author.id,
                        name: msg.guild.member(msg.author).displayName,
                        alive: true
                    };
                    if (!game.players.find(player => player.id == msg.author.id)) {
                        game.players.push(player);
                        msg.member.roles.add(game.cache.playerRole);
                        msg.reply(`You have joined the game!`);
                        //msg.channel.updateOverwrite(msg.author.id, {SEND_MESSAGES: true}); // Why is this here?
                    } else {
                        console.log(`${msg.author.username} is trying to double join!`);
                    }
                } else { //No game to join
                    msg.reply("Sorry brudda, there is no game running right now.");
                }
            } else if (command == 'lynch') {
                //Vote to lynch a play if available
            } else if (command == 'playerlist') {
                //List all of the player; format to game
                if (gameIndex >= 0) {
                    var liststring = 'Player\'s currently alive:\n'
                    for (var i = 0; i < activeGames[gameIndex].players.length; i++) {
                        liststring += `${activeGames[gameIndex].players[i].name}\n`;
                    }
                    msg.channel.send(liststring);
                }
            } else if (command == 'forcestop') {
                if (gameIndex >= 0) { //Ensure a game is running here
                    forceStop(msg, game, gameIndex);
                }
            }
        }
    }
});

//Commands
function forceStop(msg, game, gameIndex) {
    if (game.gm == msg.author.id) { //User is gm
        endGame(gameIndex).then(value => {
            if (value) {
                msg.reply('the game has been forcibly terminated.');
            } else {
                msg.reply('the game could not be stopped. Please contact someone for support.');
            }
        }).catch(console.error);
    } else { //Not GM
        console.log(`${msg.author.username} wants to illegally stop a game`);
    }
}

//Helper functions
async function endGame(gameIndex) {
    var game = activeGames[gameIndex];
    var server = bot.guilds.resolve(game.server);
    var channel = server.channels.resolve(game.channel);
    var playerRole = game.cache.playerRole;
    var gmRole = game.cache.gmRole;

    var success = false;

    //Finally remove game from active
    await db_col_games.deleteOne({_id: game._id}).then(result => {
        if (result.deletedCount > 0) {
            //Remove roles
            for (var i = 0; i < game.players.length; i++) {
                server.member(game.players[i].id).roles.remove(playerRole);

                if (game.players[i] == game.gm) //Remove GM
                    server.member(game.players[i]).roles.remove(gmRole);
            }

            //Reset perms
            channel.permissionOverwrites.forEach((value, key) => {
                if (key == playerRole.id || key == gmRole.id) {
                    console.log(`Removing role '${(key == playerRole.id) ? playerRole.name : gmRole.name}' from #${channel.name}`);
                    channel.permissionOverwrites.delete(key);
                } else if (key == server.roles.everyone.id) {
                    console.log(`Reseting @everyone for #${channel.name}`);
                    channel.updateOverwrite(server.roles.everyone, {
                        SEND_MESSAGES: true
                    });
                }
            });

            //Delete game roles
            game.cache.playerRole.delete('Game ended');
            game.cache.gmRole.delete('Game ended');

            activeGames.splice(gameIndex);

            success = true;
        }
    }).catch(console.error);

    return success;
}

function gameExists(serverID, channelID) {
    return activeGames.filter(game => game.server == serverID).findIndex(game => game.channel == channelID);
}

function formatMinutes(minutes) {
    return `${(minutes < 1) ? "Less than " : ""}${(minutes < 1) ? 1 : minutes} minute${(minutes > 1) ? "s" : ""}`;
}

const gameLoop = setInterval(() => {
    //Tick
    for (var i = 0; i < activeGames.length; i++) {
        var game = activeGames[i];
        var server = bot.guilds.resolve(activeGames[i].server);
        var channel = server.channels.resolve(activeGames[i].channel);
        const timeLeft = moment(game.timeLeft).diff(moment(), 'seconds');
        
        //Check for signup period
        if (game.day < 1 && timeLeft % 60 === 0) {
            if (activeGames[i].currentMessage) {
                activeGames[i].currentMessage.edit(new Discord.MessageEmbed()
                    .setDescription(`**A GAME OF MAFIA HAS BEGUN!**\nType \`${prefix}join\` to join this fun game!`)
                    .addField('Time Left', formatMinutes(timeLeft / 60 - 1)));
            }
        }

        //Game logic
        if (timeLeft <= 0) { //Proceed with game logic
            game.timeLeft = moment().add(game.lengthOfDays, 'seconds');
            
            if (game.type == "Mafia") {
                if (game.day > 0) { //In game
                    if (game.night) {
                        game.day++;
                        game.night = false;
                        channel.updateOverwrite(game.cache.playerRole, {
                            SEND_MESSAGES: true
                        });
                    } else {
                        game.night = true;
                        channel.updateOverwrite(game.cache.playerRole, {
                            SEND_MESSAGES: false
                        });
                    }
                    game.votes = [];
                    bot.guilds.resolve(game.server).channels.resolve(game.channel).send(`**${(game.night) ? "Night" : "Day"} ${game.day} has begun! You have ${game.lengthOfDays} seconds to ${(game.night) ? "perform your night actions!**" : `chat and decide if you want to lynch.**\nUse \`${prefix}lynch @[player]\` to vote to lynch.`}`);
                } else {
                    //Start the game
                    var channel = bot.guilds.resolve(game.server).channels.resolve(game.channel);
                    channel.updateOverwrite(channel.guild.roles.everyone, {
                        SEND_MESSAGES: false
                    });
                    game.day = 1;
                    channel.send(`**The game has begun! You have ${game.lengthOfDays} seconds to chat and decide if you want to lynch.**\nUse \`${prefix}lynch @[player]\` to vote to lynch.`);
                }
            }
        }
    }
}, 1000);
gameLoop.unref();

// FINAL: START BOT PROCESSES
//Log in the bot
bot.login(token).then((value) => {
    console.log("Game Master is now online!");
    MongoClient.connect(db_url, {useUnifiedTopology: true}, async (err, client) => {
        assert.equal(null, err);
        console.log('~ DATABASE CONNECTION: SUCCESS');

        db = client.db(db_name);

        //Fetch info from DB
        activeGames = [];
        db_col_games = db.collection('games');
        const gameArray = await db_col_games.find().toArray();
        for (var i = 0; i < gameArray.length; i++) {
            const gameObj = await databaseUtils.deserializeGame(gameArray[i], bot);
            activeGames.push(gameObj);
        }
        console.log(`Finished pulling games!`);
        console.log(activeGames);
        ready = true;
        /*db_col_games.find().forEach((doc) => {
            const game = databaseUtils.deserializeGame(doc, bot);
            console.log(game);
            activeGames.push(game);
        }, (err) => {
            if (err) console.log(err);
            
            console.log(`Finished pulling games!`);
            console.log(activeGames);
            ready = true;
        });*/
    });
});