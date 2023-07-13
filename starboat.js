const { Client } = require('eris');
const Database = require('better-sqlite3');
const db = new Database('star.db');
const client = new Client('token', { intents: ['guilds', 'guildMessageReactions'] });

db.pragma('journal_mode = WAL');
db.prepare('CREATE TABLE IF NOT EXISTS starids (msgid TEXT PRIMARY KEY, starid TEXT NOT NULL)').run();

client.on('messageReactionAdd', async (message, emoji, user) => {
  if (message.channel.type !== 0 || emoji.name !== '⭐') return;

  const channel = client.getChannel(message.channel.id);
  const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

  if (channel.nsfw || !starboard || channel.id === starboard.id) return;

  const msg = await channel.getMessage(message.id);
  const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id)?.bot).length;

  if (msg.content.length === 0 && msg.attachments.length === 0 && (!msg.embeds[0] || msg.embeds[0].type !== 'image')) return;

  const starId = await getMessageFromDatabase(msg.id);

  if (!starId) {
    if (!stars) return;
    const reference = msg.referencedMessage;
    const referenceContent = reference
      ? (reference.content.length > 512 ? reference.content.substring(0, 509) + '...' : (reference.content.length === 0 ? `[\`No content, jump to message\`](${reference.jumpLink})` : reference.content))
      : '';
    const referenceAuthor = reference ? `${reference.author.username}${reference.author.discriminator !== '0' ? `#${msg.author.discriminator}` : ''}` : '';
    const referenceExtra = reference ? `> Reply to **${referenceAuthor}**\n${referenceContent.split('\n').map(line => `> ${line}`).join('\n')}` : '';
    const msgContent = msg.content.length > 1475 ? msg.content.substring(0, 1475) + '...' : msg.content;
    const videoUrl = resolveVideoAttachment(msg);

    const starMsg = await starboard.createMessage({
      content: `${stars} ⭐ - ${msg.jumpLink}`,
      embed: {
        color: 0xFDD744,
        author: {
          name: `${msg.author.username}${msg.author.discriminator !== '0' ? `#${msg.author.discriminator}` : ''}`,
          icon_url: msg.author.avatarURL
        },
        description: `${referenceExtra}\n\n${msgContent.replace(/\[]\(([^\)]*)\)/g, '$1')}`,
        fields: videoUrl ? [
          {
            name: '\u200b',
            value: `[\`Video Attachment\`](${videoUrl})`
          }
        ] : [],
        image: resolveAttachment(msg),
        timestamp: new Date()
      }
    });

    db.prepare('INSERT INTO starids VALUES (?, ?)').run(msg.id, starMsg.id);
  } else {
    const starMessage = await starboard.getMessage(starId);
    if (!starMessage) return;
    await starMessage.edit(`${stars} ⭐ - <#${msg.channel.id}>`);
  }
});

client.on('messageReactionRemove', async (message, emoji, user) => {
  if (message.channel.type !== 0 || emoji.name !== '⭐') return;

  const channel = client.getChannel(message.channel.id);
  const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

  if (!starboard || channel.id === starboard.id) return;

  const msg = await channel.getMessage(message.id);
  const starId = await getMessageFromDatabase(msg.id);
  if (!starId) return;

  const starMessage = await starboard.getMessage(starId).catch(() => null);
  if (!starMessage) return db.prepare('DELETE FROM starids WHERE msgid = ?').run(msg.id);

  if (!msg.reactions['⭐']) {
    db.prepare('DELETE FROM starids WHERE msgid = ?').run(msg.id);
    return await starMessage.delete();
  }

  const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id)?.bot).length;

  if (!stars) {
    db.prepare('DELETE FROM starids WHERE msgid = ?').run(msg.id);
    return await starMessage.delete();
  }

  await starMessage.edit(`${stars} ⭐ - ${msg.jumpLink}`);
});

function getMessageFromDatabase(msgid) {
  return (db.prepare('SELECT * FROM starids WHERE msgid = ?').get(msgid) || {}).starid;
}

function resolveAttachment(msg) {
  const embedImage = msg.embeds[0]?.image ?? msg.embeds[0]?.thumbnail;
  return msg.attachments[0]?.width ? msg.attachments[0] : (msg.embeds[0]?.type === 'image' ? embedImage : undefined);
}

function resolveVideoAttachment(msg) {
  const attachmentVideo = msg.attachments[0]?.content_type?.startsWith('video/') ? msg.attachments[0]?.url : undefined;
  const embedVideo = msg.embeds[0]?.type === 'video' ? msg.embeds[0]?.video?.url : undefined;
  return attachmentVideo ?? embedVideo;
}

client.connect();
