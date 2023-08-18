const { Client } = require('eris');
const Database = require('better-sqlite3');
const db = new Database('star.db');
const client = new Client('token', { intents: ['guilds', 'guildMessageReactions'] });

db.pragma('journal_mode = WAL');
db.prepare('CREATE TABLE IF NOT EXISTS starids (msgid TEXT PRIMARY KEY, starid TEXT NOT NULL)').run();

client.on('messageReactionAdd', async (message, emoji, user) => {
  if (message.channel.type !== 0 || emoji.name !== '⭐') return;

  const channel = message.channel;
  const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

  if (channel.nsfw || !starboard || channel.id === starboard.id) return;

  const [msg, rawStars] = await Promise.all([
    channel.getMessage(message.id),
    client.getMessageReaction(message.channel.id, message.id, '⭐', { limit: 100 })
  ]);

  const stars = rawStars.filter(u => u.id !== msg.author.id && !client.users.get(u.id)?.bot).length;

  if (!stars || !msg.content.length && !msg.attachments.length && (!msg.embeds.length || msg.embeds[0].type !== 'image')) return;

  const starId = getMessageFromDatabase(message.id);

  if (!starId) { // if newly starred message
    const reference = msg.referencedMessage;
    const referenceContent = reference
      ? (reference.content.length > 512 ? reference.content.substring(0, 509) + '...' : (reference.content.length === 0 ? `[\`No content, jump to message\`](${reference.jumpLink})` : reference.content))
      : '';
    const referenceAuthor = reference ? `${reference.author.username}${reference.author.discriminator !== '0' ? `#${msg.author.discriminator}` : ''}` : '';
    const referenceExtra = reference ? `> Reply to **${referenceAuthor}**\n${referenceContent.split('\n').map(line => `> ${line}`).join('\n')}` : '';
    const msgContent = msg.content.length > 1475 ? msg.content.substring(0, 1475) + '...' : msg.content;
    const videoUrl = resolveVideoAttachment(msg);

    const starMsg = await starboard.createMessage({
      content: `${stars} ⭐`,
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
      },
      components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Jump to Message', url: msg.jumpLink }] }]
    });

    db.prepare('INSERT INTO starids VALUES (?, ?)').run(msg.id, starMsg.id);
  } else {
    starboard.getMessage(starId)
      .catch(() => db.prepare('DELETE FROM starids WHERE msgid = ?').run(message.id))
      .then(msg => msg.edit(`${stars} ⭐`))
  }
});

client.on('messageReactionRemove', async (message, emoji, user) => {
  if (message.channel.type !== 0 || emoji.name !== '⭐') return;

  const channel = message.channel;
  const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

  if (!starboard || channel.id === starboard.id) return;

  const starId = getMessageFromDatabase(message.id);
  if (!starId) return;

  const [msg, starMessage, rawStars] = await Promise.all([
    channel.getMessage(message.id),
    starboard.getMessage(starId).catch(() => null),
    client.getMessageReaction(channel.id, message.id, '⭐', { limit: 100 })
  ]);

  if (!starMessage) return db.prepare('DELETE FROM starids WHERE msgid = ?').run(message.id);

  const stars = rawStars.filter(u => u.id !== msg.author.id && !client.users.get(u.id)?.bot).length;

  if (!stars) {
    db.prepare('DELETE FROM starids WHERE msgid = ?').run(message.id);
    return await starMessage.delete();
  }

  await starMessage.edit(`${stars} ⭐`);
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
