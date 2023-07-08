import { Channel, Client, GatewayIntentBits, GuildChannel, Message, MessageFlags, TextBasedChannel, TextChannel } from 'discord.js';
import { DatabaseManager } from './map_database_manager.js';
import 'dotenv/config';

// DB Set-up
const db = new DatabaseManager();

// Client Set-up
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.login(process.env['API_TOKEN']);

// Portal Management
type PortalDocument = {
    channel_list: string[],
    pending_channels: string[],
    portal_owner: string,
}

type ChannelDocument = {
    portal: string | null,
}

function portalKey(portalId: string): [string, string] {
    return ["portals", portalId];
}
function channelKey(channelId: string): [string, string] {
    return ["channels", channelId];
}

function generateId(): number {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

async function hasPortal(channelId: string): Promise<boolean> {
    let channelRes = await db.get<ChannelDocument>(...channelKey(channelId));
    return channelRes !== undefined && channelRes?.portal !== null;
}

async function createPortal(portalId: string, channelId: string): Promise<void> {
    let q1 = db.set<PortalDocument>(...portalKey(portalId), {
        channel_list: [`${channelId}`],
        pending_channels: [],
        portal_owner: channelId
    });
    let q2 = db.set<ChannelDocument>(...channelKey(channelId), {
        portal: `${portalId}`,
    });
    await Promise.all([q1, q2]);
}

async function requestPortal(portalId: string, channelId: string): Promise<void> {
    let pendingChannelsList = (await db.get<PortalDocument>(...portalKey(portalId)))?.pending_channels;
    if(pendingChannelsList === undefined) throw new Error("Portal Doesn't Exist!");
    
    let q1 = db.set<PortalDocument>(...portalKey(portalId), {
        pending_channels: [...pendingChannelsList, `${channelId}`]
    });
    // let q2 = db.set<ChannelDocument>(...channelKey(channelId), {
    //     portal: `${portalId}`,
    // });
    await q1;
}

async function removePending(portalId: string, channelId: string): Promise<void> {
    let pendingChannelsList = (await db.get<PortalDocument>(...portalKey(portalId)))?.pending_channels;
    if(pendingChannelsList === undefined) throw new Error("Portal Doesn't Exist!");
    
    let q1 = db.set<PortalDocument>(...portalKey(portalId), {
        pending_channels: pendingChannelsList.filter((v) => v !== channelId)
    });
    // let q2 = db.set<ChannelDocument>(...channelKey(channelId), {
    //     portal: `${portalId}`,
    // });
    await q1;
}

async function requestPending(portalId: string, channelId: string): Promise<boolean> {
    let pendingChannelsList = (await db.get<PortalDocument>(...portalKey(portalId)))?.pending_channels;
    if(pendingChannelsList === undefined) throw new Error("Portal Doesn't Exist!");
    return pendingChannelsList.includes(channelId);
}

async function addToPortal(portalId: string, channelId: string): Promise<void> {
    let portalDocument = (await db.get<PortalDocument>(...portalKey(portalId)));
    if(portalDocument === undefined) throw new Error("Portal Doesn't Exist!");
    
    let q1 = db.set<PortalDocument>(...portalKey(portalId), {
        pending_channels: portalDocument.pending_channels.filter((v) => v !== channelId),
        channel_list: [...portalDocument.channel_list, channelId]
    });
    let q2 = db.set<ChannelDocument>(...channelKey(channelId), {
        portal: `${portalId}`,
    });
    await Promise.all([q1, q2]);
}

async function channelPortal(channelId: string): Promise<string> {
    return (await db.get<ChannelDocument>(...channelKey(channelId)))?.portal as string;
}

async function portalMembers(portalId: string): Promise<string[]> {
    return (await db.get<PortalDocument>(...portalKey(portalId)))?.channel_list as string[];
}

async function removeFromPortal(portalId: string, channelId: string): Promise<void> {
    let channelList: string[] = (await db.get<PortalDocument>(...portalKey(portalId)))?.channel_list as string[];
    let newChannelList = channelList.filter((n: string) => n !== `${channelId}`);
    let q1;
    if (newChannelList.length == 0) {
        q1 = db.delete(...portalKey(portalId));
        console.log(`Deleting portal ${portalId}`);
    } else {
        q1 = db.set<PortalDocument>(...portalKey(portalId), {
            channel_list: newChannelList,
        });
    }
    let q2 = db.set<ChannelDocument>(...channelKey(channelId), {
        portal: null
    });
    await Promise.all([q1, q2]);
}

async function broadcastMessage(targetMessage: Message) {
    let messageOptions = {
        content: `<**${targetMessage.author.username}** (from **${targetMessage.guild?.name || "unknown server"}**#*${(targetMessage.channel as TextChannel).name}*)>\n${targetMessage.content}`,
        files: [...targetMessage.attachments.values()],
    };
    if(!await hasPortal(targetMessage.channelId)) {
        return;
    }
    let portalId = await channelPortal(targetMessage.channelId);
    if(portalId === null) {
        return;
    }
    let otherChannels = await portalMembers(portalId);
    if(otherChannels === null || otherChannels === undefined) {
        return;
    }
    console.log(otherChannels);
    let failedChannels: string[] = [];
    for (let channel of otherChannels) {
        if (channel !== targetMessage.channelId) {
            let targetChannel: TextBasedChannel | undefined = client.channels.cache.get(channel) as TextBasedChannel | undefined;
            if (targetChannel === undefined) {
                failedChannels.push(channel);
                continue;
            }
            targetChannel.send(messageOptions);
        }
    }

    if(failedChannels.length > 0) {
        let sentMessagePromise = targetMessage.reply({
            content: `Message failed to send on some channels`,
        });
        setTimeout(async () => {
            (await sentMessagePromise).delete();
        }, 5000);
    }
}

// Listening to Events
const callbackMap = new Map<string, (m: Message, a: any[]) => Promise<string | void>>(
    [
        ["rickroll", async (message: Message, args: string[]): Promise<void> => {
            message.channel.send("Never Gonna Give You Up!");
        }],
        ["create-portal", async (message: Message, args: string[]) => {
            // if(args.length < 1) {
            //   message.channel.send("Error: Too few arguments!");
            //   return "Error: Too few arguments!";
            // }
            if (await hasPortal(message.channelId)) {
                message.channel.send("Error: This channel already has a portal");
                return "Error: This channel already has a portal";
            }
            let portalId: number;
            do {
                portalId = generateId();
            } while ((await db.get<PortalDocument>(...portalKey(`${portalId}`))) !== undefined);
            await createPortal(`${portalId}`, message.channelId);
            message.author.send(`Successfully created portal ${portalId}`);
        }],
        ["set-portal", async (message: Message, args: string[]) => {
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [portalId] = args;

            if (await hasPortal(message.channelId)) {
                message.channel.send("Error: This channel already has a portal");
                return "Error: This channel already has a portal";
            }
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            await requestPortal(portalId, message.channelId);
            message.channel.send("The portal request has been sent");
            (client.channels.cache.get(portalDocument.portal_owner) as TextChannel).send(`Channel *${message.channelId}* **"${(message.channel as TextChannel).name}"** from server **"${message.guild?.name}"** requests to join the portal`);
        }],
        ["add-portal-member", async (message: Message, args: string[]) => {
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [channelId] = args;

            if (!await hasPortal(message.channelId)) {
                message.channel.send("Error: This channel doesn't have a portal");
                return "Error: This channel doesn't have a portal";
            }
            let channelDocument = await db.get<ChannelDocument>(...channelKey(message.channelId)) as ChannelDocument;
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${channelDocument.portal}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if(!await requestPending(channelDocument.portal as string, channelId)) {
                let content = "Error: this channel never sent an invitation request";
                message.channel.send(content);
                return content;
            }
            if(await hasPortal(channelId)) {
                let content = "Error: this channel is already part of another portal";
                await removePending(channelDocument.portal as string, channelId);
                message.channel.send(content);
                return content;
            }
            await addToPortal(channelDocument.portal as string, channelId);
            message.channel.send(`Channel ${channelId} was successfully added!`);
            let addedChannel = (client.channels.cache.get(channelId) as TextChannel);
            addedChannel.send(`Channel *${message.channelId}* **"${(message.channel as TextChannel).name}"** from server **"${message.guild?.name}"** has accepted your portal join request`);
            for(let toBroadcastChannelId of portalDocument.channel_list) {
                if(toBroadcastChannelId === message.channelId || toBroadcastChannelId === channelId) continue;
                (client.channels.cache.get(toBroadcastChannelId) as TextChannel).send(`Channel ${channelId} **"${addedChannel.name}"** (from **${addedChannel.guild?.name}**) joined the portal`);
            }
        }],
        ["transfer-ownership", async(message: Message, args: string[]) => {
            if (args.length < 1) {
                message.channel.send("Error: Too few arguments!");
                return "Error: Too few arguments!";
            }
            let [channelId] = args;

            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }

            let portalId = await channelPortal(message.channelId);
            
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if(portalDocument.portal_owner !== message.channelId) {
                let messageContent = "Error: You are not the portal owner";
                message.channel.send(messageContent);
                return messageContent;
            }
            if(!portalDocument.channel_list.includes(channelId)) {
                let messageContent = "Error: That channel is not a portal member";
                message.channel.send(messageContent);
                return messageContent;
            }
            await db.set<PortalDocument>(...portalKey(`${portalId}`), {
                portal_owner: channelId
            });
            message.channel.send("You are no longer the portal owner");
            (client.channels.cache.get(channelId) as TextChannel).send("You are now the portal owner");
        }],
        ["delete-portal", async(message: Message, args: string[]) => {
            // if (args.length < 1) {
            //     message.channel.send("Error: Too few arguments!");
            //     return "Error: Too few arguments!";
            // }
            // let [channelId] = args;

            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }

            let portalId = await channelPortal(message.channelId);
            
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if(portalDocument.portal_owner !== message.channelId) {
                let messageContent = "Error: You are not the portal owner";
                message.channel.send(messageContent);
                return messageContent;
            }
            await db.delete(...portalKey(`${portalId}`));
            for(let channelId of portalDocument.channel_list) {
                await db.set<ChannelDocument>(...channelKey(channelId), {
                    portal: null,
                });
                (client.channels.cache.get(channelId) as TextChannel).send("The portal owner deleted this portal");
            }
            message.channel.send("The portal has been deleted");
        }],
        ["remove-portal", async (message: Message, args: string[]) => {
            // if(args.length < 1) {
            //   message.channel.send("Error: Too few arguments!");
            //   return "Error: Too few arguments!";
            // }
            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }

            let portalId = await channelPortal(message.channelId);
            
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            if(portalDocument.portal_owner === message.channelId) {
                let messageContent = "Error: You cannot remove this channel from the portal, since this channel is the portal owner. Transfer ownership to another server first.";
                message.channel.send(messageContent);
                return messageContent;
            }
            await removeFromPortal(portalId, message.channelId);
            message.author.send(`Successfully removed from portal ${portalId}`);
            for(let channelId of portalDocument.channel_list) {
                if(channelId == message.channelId) continue;
                (client.channels.cache.get(channelId) as TextChannel).send(`Channel ${message.channelId} **"${(message.channel as TextChannel).name}"** (from **${message.guild?.name}**) left the portal`);
            }
        }],
        ["portal-info", async (message: Message, args: string[]) => {
            // if(args.length < 1) {
            //   message.channel.send("Error: Too few arguments!");
            //   return "Error: Too few arguments!";
            // }
            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }

            let portalId = await channelPortal(message.channelId);
            
            let portalDocument = await db.get<PortalDocument>(...portalKey(`${portalId}`));
            if (portalDocument === undefined) {
                message.channel.send("Error: The portal does not exist");
                return "Error: The portal does not exist";
            }
            let messageContent = `**Portal Owner**: ${portalDocument.portal_owner}

**Members:**
${portalDocument.channel_list.map((memberId) => {
    let memberChannel = (client.channels.cache.get(memberId) as TextChannel);
    return `- Channel *${memberId}* **"${memberChannel.name}"** (Server: **${memberChannel.guild.name}**)${(portalDocument?.portal_owner === memberId ? "**(OWNER)**" : "")}`;
}).join("\n")}

**Pending Members:**
${portalDocument.pending_channels.map((memberId) => {
    let memberChannel = (client.channels.cache.get(memberId) as TextChannel);
    return `- Channel *${memberId}* **"${memberChannel.name}"** (Server: **${memberChannel.guild.name}**)${(portalDocument?.portal_owner === memberId ? "**(OWNER)**" : "")}`;
}).join("\n")}`;
            message.channel.send(messageContent);
        }],
        ["test-message", async (message: Message, args: string[]) => {
            // if(args.length < 1) {
            //   message.channel.send("Error: Too few arguments!");
            //   return "Error: Too few arguments!";
            // }
            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            let otherChannels = await portalMembers(await channelPortal(message.channelId));
            console.log(otherChannels);
            let failedChannels: string[] = [];
            for (let channel of otherChannels) {
                if (channel !== message.channelId) {
                    let targetChannel: TextBasedChannel | undefined = client.channels.cache.get(channel) as TextBasedChannel | undefined;
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
            setTimeout(async () => {
                (await sentMessagePromise).delete();
            }, 5000);
        }],
        // ["message", async (message: Message, args: string[]) => {
        //     // if(args.length < 1) {
        //     //   message.channel.send("Error: Too few arguments!");
        //     //   return "Error: Too few arguments!";
        //     // }
        //     if (!(await hasPortal(message.channelId))) {
        //         message.channel.send("Error: This channel does not have a portal");
        //         return "Error: This channel does not have a portal";
        //     }
        //     if (message?.reference?.messageId === undefined) {
        //         message.channel.send("Error: Reply to the message you want to send");
        //         return "Error: Reply to the message you want to send";
        //     }
        //     let targetMessage = await message.channel.messages.fetch(message.reference.messageId);
            
        //     if (targetMessage.author.id !== message.author.id) {
        //         message.channel.send("Error: You can only send messages you wrote");
        //         return "Error: You can only send messages you wrote";
        //     }

        //     // TODO include messaging code

        //     let sentMessagePromise = message.reply({
        //         content: (failedChannels.length === 0 ? `Message sent!` : `Message failed to send on some channels`),
        //     });
        //     setTimeout(async () => {
        //         (await sentMessagePromise).delete();
        //     }, 5000);
        // }],
        ["portal-id", async (message: Message, args: string[]) => {
            // if(args.length < 1) {
            //   message.channel.send("Error: Too few arguments!");
            //   return "Error: Too few arguments!";
            // }
            if (!(await hasPortal(message.channelId))) {
                message.channel.send("Error: This channel does not have a portal");
                return "Error: This channel does not have a portal";
            }
            message.author.send(`The portal ID of this channel is ${await channelPortal(message.channelId)}`);
        }],
        ["debug", async (message: Message, args: string[]) => {
            console.log(client.channels.cache.get(message.channelId));
            console.log(typeof message.channelId);
            let targetChannel: TextBasedChannel | undefined = client.channels.cache.get(message.channelId) as TextBasedChannel | undefined;
            if (targetChannel === undefined) {
                let messageContent = "Error: The target channel was not found";
                message.channel.send(messageContent);
                return messageContent;
            }
            targetChannel?.send("Debug!");
        }],
    ],
);

async function processCommand(message: Message, keywords: string[]) {
    const args = keywords.slice(1);
    console.log(`Command: ${keywords[0]} ${args}`);
    return await callbackMap.get(keywords[0])?.(message, args);
}

client.on("messageCreate", async (message: Message) => {
    if (message?.author.bot) return;

    if (!message?.content.startsWith("$$")) {
        broadcastMessage(message);
        return;
    }

    const res = await processCommand(message, message.content.slice(2).trim().split(" "));

    console.log(res);
});

// Interaction Endpoint (From starter-discord-bot)
import express from "express";
import axios from "axios";
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from "discord-interactions";
const app = express();

const discord_api = axios.create({
  baseURL: 'https://discord.com/api/',
  timeout: 3000,
  headers: {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
	"Access-Control-Allow-Headers": "Authorization",
	"Authorization": `Bot ${process.env["API_TOKEN"]}`
  }
});
app.post('/interactions', verifyKeyMiddleware(process.env["PUBLIC_KEY"] as string), async (req, res) => {
    const interaction = req.body;
  
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      console.log(interaction.data.name)
      if(interaction.data.name == 'yo'){
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Yo ${interaction.member.user.username}!`,
          },
        });
      }
  
      if(interaction.data.name == 'dm'){
        // https://discord.com/developers/docs/resources/user#create-dm
        let c = (await discord_api.post(`/users/@me/channels`,{
          recipient_id: interaction.member.user.id
        })).data
        try{
          // https://discord.com/developers/docs/resources/channel#create-message
          let res = await discord_api.post(`/channels/${c.id}/messages`,{
            content:'Yo! I got your slash command. I am not able to respond to DMs just slash commands.',
          })
          console.log(res.data)
        }catch(e){
          console.log(e)
        }
  
        return res.send({
          // https://discord.com/developers/docs/interactions/receiving-and-responding#responding-to-an-interaction
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data:{
            content:'👍'
          }
        });
      }
    }
});
app.get('/register_commands', async (req,res) =>{
  let slash_commands = [
    {
      "name": "yo",
      "description": "replies with Yo!",
      "options": []
    },
    {
      "name": "dm",
      "description": "sends user a DM",
      "options": []
    }
  ]
  try
  {
    // api docs - https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
    let discord_response = await discord_api.put(
      `/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
      slash_commands
    )
    console.log(discord_response.data)
    return res.send('commands have been registered')
  }catch(e){
    console.error(e.code)
    console.error(e.response?.data)
    return res.send(`${e.code} error from discord`)
  }
})


app.get('/', async (req,res) =>{
  return res.send('Follow documentation ')
})


app.listen(8999, () => {

})