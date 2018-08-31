const { Client } = require('eris');
const Database = require('better-sqlite3');
const db = new Database('star.db');
const client = new Client('token');

db.prepare('CREATE TABLE IF NOT EXISTS starids (msgid TEXT PRIMARY KEY, starid TEXT NOT NULL)').run();

client.on('messageReactionAdd', async (message, emoji, user) => {
  if (message.channel.type !== 0 || emoji.name !== '⭐') return;

  const channel = client.getChannel(message.channel.id);
  const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

  if (channel.nsfw || !starboard || channel.id === starboard.id) return;

  const msg = await channel.getMessage(message.id);
  const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id).bot).length;

  if (msg.content.length === 0 && msg.attachments.length === 0 && (!msg.embeds[0] || msg.embeds[0].type !== 'image')) return;

  const starId = await getMessageFromDatabase(msg.id);

  if (!starId) {
    if (!stars) return;

    const starMsg = await starboard.createMessage({
      content: `${stars} ⭐ - <#${msg.channel.id}>`,
      embed: {
        color: 0xFDD744,
        author: {
          name: `${msg.author.username}#${msg.author.discriminator}`,
          icon_url: msg.author.avatarURL
        },
        description: msg.content,
        timestamp: new Date(),
        image: resolveAttachment(msg)
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

  const starMessage = await starboard.getMessage(starId);
  if (!starMessage) return;

  if (!msg.reactions['⭐']) {
    db.prepare('DELETE FROM starids WHERE msgid = ?').run(msg.id);
    return await starMessage.delete();
  }

  const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id).bot).length;

  if (!stars) {
    db.prepare('DELETE FROM starids WHERE msgid = ?').run(msg.id);
    return await starMessage.delete();
  }

  await starMessage.edit(`${stars} ⭐ - <#${msg.channel.id}>`);
});

function getMessageFromDatabase(msgid) {
  return (db.prepare('SELECT * FROM starids WHERE msgid = ?').get(msgid) || {}).starid;
}

function resolveAttachment(msg) {
  if (msg.attachments.length > 0 && msg.attachments[0].width) {
    return msg.attachments[0];
  } else if (msg.embeds.length > 0 && msg.embeds[0].type === 'image') {
    return msg.embeds[0].image || msg.embeds[0].thumbnail;
  } else {
    return null;
  }
}

client.connect();
