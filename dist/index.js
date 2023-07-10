import { __awaiter } from "tslib";
import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import { DatabaseManager } from './map_database_manager.js';
import 'dotenv/config';
const db = new DatabaseManager();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});
client.login(process.env['API_TOKEN']);
function portalKey(portalId) {
    return ["portals", portalId];
}
function channelKey(channelId) {
    return ["channels", channelId];
}
function generateId() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
function hasPortal(channelId) {
    return __awaiter(this, void 0, void 0, function* () {
        let channelRes = yield db.get(...channelKey(channelId));
        return channelRes !== undefined && (channelRes === null || channelRes === void 0 ? void 0 : channelRes.portal) !== null;
    });
}
function createPortal(portalId, channelId) {
    return __awaiter(this, void 0, void 0, function* () {
        let q1 = db.set(...portalKey(portalId), {
            channel_list: [`${channelId}`],
            pending_channels: [],
            portal_owner: channelId
        });
        let q2 = db.set(...channelKey(channelId), {
            portal: `${portalId}`,
        });
        yield Promise.all([q1, q2]);
    });
}
function requestPortal(portalId, channelId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let pendingChannelsList = (_a = (yield db.get(...portalKey(portalId)))) === null || _a === void 0 ? void 0 : _a.pending_channels;
        if (pendingChannelsList === undefined)
            throw new Error("Portal Doesn't Exist!");
        let q1 = db.set(...portalKey(portalId), {
            pending_channels: [...pendingChannelsList, `${channelId}`]
        });
        yield q1;
    });
}
function removePending(portalId, channelId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let pendingChannelsList = (_a = (yield db.get(...portalKey(portalId)))) === null || _a === void 0 ? void 0 : _a.pending_channels;
        if (pendingChannelsList === undefined)
            throw new Error("Portal Doesn't Exist!");
        let q1 = db.set(...portalKey(portalId), {
            pending_channels: pendingChannelsList.filter((v) => v !== channelId)
        });
        yield q1;
    });
}
function requestPending(portalId, channelId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let pendingChannelsList = (_a = (yield db.get(...portalKey(portalId)))) === null || _a === void 0 ? void 0 : _a.pending_channels;
        if (pendingChannelsList === undefined)
            throw new Error("Portal Doesn't Exist!");
        return pendingChannelsList.includes(channelId);
    });
}
function addToPortal(portalId, channelId) {
    return __awaiter(this, void 0, void 0, function* () {
        let portalDocument = (yield db.get(...portalKey(portalId)));
        if (portalDocument === undefined)
            throw new Error("Portal Doesn't Exist!");
        let q1 = db.set(...portalKey(portalId), {
            pending_channels: portalDocument.pending_channels.filter((v) => v !== channelId),
            channel_list: [...portalDocument.channel_list, channelId]
        });
        let q2 = db.set(...channelKey(channelId), {
            portal: `${portalId}`,
        });
        yield Promise.all([q1, q2]);
    });
}
function channelPortal(channelId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        return (_a = (yield db.get(...channelKey(channelId)))) === null || _a === void 0 ? void 0 : _a.portal;
    });
}
function portalMembers(portalId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        return (_a = (yield db.get(...portalKey(portalId)))) === null || _a === void 0 ? void 0 : _a.channel_list;
    });
}
function removeFromPortal(portalId, channelId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let channelList = (_a = (yield db.get(...portalKey(portalId)))) === null || _a === void 0 ? void 0 : _a.channel_list;
        let newChannelList = channelList.filter((n) => n !== `${channelId}`);
        let q1;
        if (newChannelList.length == 0) {
            q1 = db.delete(...portalKey(portalId));
            console.log(`Deleting portal ${portalId}`);
        }
        else {
            q1 = db.set(...portalKey(portalId), {
                channel_list: newChannelList,
            });
        }
        let q2 = db.set(...channelKey(channelId), {
            portal: null
        });
        yield Promise.all([q1, q2]);
    });
}
function broadcastMessage(targetMessage) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield hasPortal(targetMessage.channelId))) {
            return;
        }
        let portalId = yield channelPortal(targetMessage.channelId);
        if (portalId === null) {
            return;
        }
        let otherChannels = yield portalMembers(portalId);
        if (otherChannels === null || otherChannels === undefined) {
            return;
        }
        console.log(otherChannels);
        let embedMessage = new EmbedBuilder().setAuthor({
            name: targetMessage.author.username,
            iconURL: (_a = targetMessage.author.avatarURL()) !== null && _a !== void 0 ? _a : undefined,
        }).setTitle(`<**${((_b = targetMessage.guild) === null || _b === void 0 ? void 0 : _b.name) || "unknown server"}**#*${targetMessage.channel.name}*>`).setDescription(targetMessage.content).setColor(((_c = targetMessage.member) === null || _c === void 0 ? void 0 : _c.displayHexColor) || null);
        let messageOptions = {
            embeds: [embedMessage],
            files: [...targetMessage.attachments.values()],
        };
        let failedChannels = [];
        for (let channel of otherChannels) {
            if (channel !== targetMessage.channelId) {
                let targetChannel = client.channels.cache.get(channel);
                if (targetChannel === undefined) {
                    failedChannels.push(channel);
                    continue;
                }
                targetChannel.send(messageOptions);
            }
        }
        if (failedChannels.length > 0) {
            let sentMessagePromise = targetMessage.reply({
                content: `Message failed to send on some channels`,
            });
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                (yield sentMessagePromise).delete();
            }), 5000);
        }
    });
}
const callbackMap = new Map([
    ["rickroll", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            message.channel.send("Never Gonna Give You Up!");
        })],
    ["create-portal", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (yield hasPortal(message.channelId)) {
                message.channel.send("Error: This channel already has a portal");
                return "Error: This channel already has a portal";
            }
            let portalId;
            do {
                portalId = generateId();
            } while ((yield db.get(...portalKey(`${portalId}`))) !== undefined);
            yield createPortal(`${portalId}`, message.channelId);
            message.author.send(`Successfully created portal ${portalId}`);
        })],
    ["set-portal", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [portalId] = args;
            if (yield hasPortal(message.channelId)) {
                message.channel.send("Error: This channel already has a portal");
                return "Error: This channel already has a portal";
            }
            let portalDocument = yield db.get(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            yield requestPortal(portalId, message.channelId);
            message.channel.send("The portal request has been sent");
            client.channels.cache.get(portalDocument.portal_owner).send(`Channel *${message.channelId}* **"${message.channel.name}"** from server **"${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}"** requests to join the portal`);
        })],
    ["add-portal-member", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            var _b, _c;
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [channelId] = args;
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel doesn't have a portal");
                return "Error: This channel doesn't have a portal";
            }
            let channelDocument = yield db.get(...channelKey(message.channelId));
            let portalDocument = yield db.get(...portalKey(`${channelDocument.portal}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if (!(yield requestPending(channelDocument.portal, channelId))) {
                let content = "Error: this channel never sent an invitation request";
                message.channel.send(content);
                return content;
            }
            if (yield hasPortal(channelId)) {
                let content = "Error: this channel is already part of another portal";
                yield removePending(channelDocument.portal, channelId);
                message.channel.send(content);
                return content;
            }
            yield addToPortal(channelDocument.portal, channelId);
            message.channel.send(`Channel ${channelId} was successfully added!`);
            let addedChannel = client.channels.cache.get(channelId);
            addedChannel.send(`Channel *${message.channelId}* **"${message.channel.name}"** from server **"${(_b = message.guild) === null || _b === void 0 ? void 0 : _b.name}"** has accepted your portal join request`);
            for (let toBroadcastChannelId of portalDocument.channel_list) {
                if (toBroadcastChannelId === message.channelId || toBroadcastChannelId === channelId)
                    continue;
                client.channels.cache.get(toBroadcastChannelId).send(`Channel ${channelId} **"${addedChannel.name}"** (from **${(_c = addedChannel.guild) === null || _c === void 0 ? void 0 : _c.name}**) joined the portal`);
            }
        })],
    ["transfer-ownership", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [channelId] = args;
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let portalId = yield channelPortal(message.channelId);
            let portalDocument = yield db.get(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if (portalDocument.portal_owner !== message.channelId) {
                let messageContent = "Error: You are not the portal owner";
                message.channel.send(messageContent);
                return messageContent;
            }
            if (!portalDocument.channel_list.includes(channelId)) {
                let messageContent = "Error: That channel is not a portal member";
                message.channel.send(messageContent);
                return messageContent;
            }
            yield db.set(...portalKey(`${portalId}`), {
                portal_owner: channelId
            });
            message.channel.send("You are no longer the portal owner");
            client.channels.cache.get(channelId).send("You are now the portal owner");
        })],
    ["delete-portal", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let portalId = yield channelPortal(message.channelId);
            let portalDocument = yield db.get(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if (portalDocument.portal_owner !== message.channelId) {
                let messageContent = "Error: You are not the portal owner";
                message.channel.send(messageContent);
                return messageContent;
            }
            yield db.delete(...portalKey(`${portalId}`));
            for (let channelId of portalDocument.channel_list) {
                yield db.set(...channelKey(channelId), {
                    portal: null,
                });
                client.channels.cache.get(channelId).send("The portal owner deleted this portal");
            }
            message.channel.send("The portal has been deleted");
        })],
    ["remove-portal", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            var _d;
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let portalId = yield channelPortal(message.channelId);
            let portalDocument = yield db.get(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if (portalDocument.portal_owner === message.channelId) {
                let messageContent = "Error: You cannot remove this channel from the portal, since this channel is the portal owner. Transfer ownership to another server first.";
                message.channel.send(messageContent);
                return messageContent;
            }
            yield removeFromPortal(portalId, message.channelId);
            message.author.send(`Successfully removed from portal ${portalId}`);
            for (let channelId of portalDocument.channel_list) {
                if (channelId == message.channelId)
                    continue;
                client.channels.cache.get(channelId).send(`Channel ${message.channelId} **"${message.channel.name}"** (from **${(_d = message.guild) === null || _d === void 0 ? void 0 : _d.name}**) left the portal`);
            }
        })],
    ["portal-info", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let portalId = yield channelPortal(message.channelId);
            let portalDocument = yield db.get(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            let messageContent = `**Portal Owner**: ${portalDocument.portal_owner}

**Members:**
${portalDocument.channel_list.map((memberId) => {
                let memberChannel = client.channels.cache.get(memberId);
                return `- Channel *${memberId}* **"${memberChannel.name}"** (Server: **${memberChannel.guild.name}**)${((portalDocument === null || portalDocument === void 0 ? void 0 : portalDocument.portal_owner) === memberId ? "**(OWNER)**" : "")}`;
            }).join("\n")}

**Pending Members:**
${portalDocument.pending_channels.map((memberId) => {
                let memberChannel = client.channels.cache.get(memberId);
                return `- Channel *${memberId}* **"${memberChannel.name}"** (Server: **${memberChannel.guild.name}**)${((portalDocument === null || portalDocument === void 0 ? void 0 : portalDocument.portal_owner) === memberId ? "**(OWNER)**" : "")}`;
            }).join("\n")}`;
            message.channel.send(messageContent);
        })],
    ["test-message", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let otherChannels = yield portalMembers(yield channelPortal(message.channelId));
            console.log(otherChannels);
            let failedChannels = [];
            for (let channel of otherChannels) {
                if (channel !== message.channelId) {
                    let targetChannel = client.channels.cache.get(channel);
                    if (targetChannel === undefined) {
                        failedChannels.push(channel);
                        continue;
                    }
                    targetChannel.send("Test!");
                }
            }
            let sentMessagePromise = message.reply({
                content: (failedChannels.length === 0 ? `Message sent!` : `Message failed to send on some channels`),
            });
            setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                (yield sentMessagePromise).delete();
            }), 5000);
        })],
    ["portal-id", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            if (!(yield hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            message.author.send(`The portal ID of this channel is ${yield channelPortal(message.channelId)}`);
        })],
    ["debug-1", (message, args) => __awaiter(void 0, void 0, void 0, function* () {
            var _e, _f;
            console.log(client.channels.cache.get(message.channelId));
            console.log(typeof message.channelId);
            let targetChannel = client.channels.cache.get(message.channelId);
            if (targetChannel === undefined) {
                let messageContent = "Error: The target channel was not found";
                message.channel.send(messageContent);
                return messageContent;
            }
            let targetEmbed = new EmbedBuilder().setAuthor({
                name: message.author.username,
                iconURL: (_e = message.author.avatarURL()) !== null && _e !== void 0 ? _e : undefined,
            }).setTitle("From a place further than the universe").setDescription(message.content).setColor(((_f = message.member) === null || _f === void 0 ? void 0 : _f.displayHexColor) || null);
            targetChannel === null || targetChannel === void 0 ? void 0 : targetChannel.send({ embeds: [targetEmbed] });
        })],
]);
function processCommand(message, keywords) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const args = keywords.slice(1);
        console.log(`Command: ${keywords[0]} ${args}`);
        return yield ((_a = callbackMap.get(keywords[0])) === null || _a === void 0 ? void 0 : _a(message, args));
    });
}
client.on("messageCreate", (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message === null || message === void 0 ? void 0 : message.author.bot)
        return;
    if (!(message === null || message === void 0 ? void 0 : message.content.startsWith("$$"))) {
        broadcastMessage(message);
        return;
    }
    const res = yield processCommand(message, message.content.slice(2).trim().split(" "));
    console.log(res);
}));
import express from "express";
const app = express();
app.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    return res.send('Woken!');
}));
app.listen(8080, () => {
});
