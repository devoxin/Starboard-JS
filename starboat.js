const Eris = require('eris');
const sql  = require('sqlite3');
const client = new Eris.Client('TOKEN');

const db = new sql.Database('star.db');
db.serialize();
db.run('CREATE TABLE IF NOT EXISTS starids (msgid TEXT PRIMARY KEY, starid TEXT NOT NULL)');

client.on('messageReactionAdd', async (message, emoji, user) => {
    if (message.channel.type !== 0 || emoji.name !== '⭐') return;

    const channel = client.getChannel(message.channel.id);
    const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

    if (channel.nsfw || !starboard || channel.id === starboard.id)
        return;

    const msg = await channel.getMessage(message.id);
    const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id).bot).length;

    if (msg.content.length === 0 && msg.attachments.length === 0) return;

    const starId = await getMessageFromDatabase(msg.id);

    if (!starId) {
        if (!stars) return;

        const msgHasImageURL = msg.content.match(/https?:\/\/(www\.)?([a-z0-9]+\.)?[a-z0-9]+\.[a-z]{2,6}\/[a-zA-Z90-9_-]+\.(png|jpg|jpeg|gif)/);

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
                image: {
                    url: msg.attachments.length > 0 ? msg.attachments[0].url : (msgHasImageURL ? msgHasImageURL[0] : '')
                }
            }
        });

        db.run('INSERT INTO starids VALUES (?, ?)', msg.id, starMsg.id);
    } else {
        const starMessage = await starboard.getMessage(starId);
        if (!starMessage) return;

        starMessage.edit(`${stars} ⭐ - <#${msg.channel.id}>`);
    }
});

client.on('messageReactionRemove', async (message, emoji, user) => {
    if (message.channel.type !== 0 || emoji.name !== '⭐') return;

    const channel = client.getChannel(message.channel.id);
    const starboard = channel.guild.channels.find(c => c.name.toLowerCase() === 'starboard');

    if (!starboard || channel.id === starboard.id)
        return;
    
    const msg = await channel.getMessage(message.id);    
    const starId = await getMessageFromDatabase(msg.id);
    if (!starId) return;

    const starMessage = await starboard.getMessage(starId);
    if (!starMessage) return;

    if (!msg.reactions['⭐']) {
        starMessage.delete();
        db.run('DELETE FROM starids WHERE msgid = ?', msg.id);
    } else {
        const stars = (await msg.getReaction('⭐', msg.reactions['⭐'].count)).filter(u => u.id !== msg.author.id && !client.users.get(u.id).bot).length;
        if (!stars) {
            starMessage.delete();
            db.run('DELETE FROM starids WHERE msgid = ?', msg.id);
        } else {
            starMessage.edit(`${stars} ⭐ - <#${msg.channel.id}>`);
        }
    }
});

function getMessageFromDatabase(msgid) {
    return new Promise((resolve) => {
        db.get('SELECT * FROM starids WHERE msgid = ?', msgid, async (err, row) => {
            if (err || !row) return resolve(null);
            return resolve(row.starid);
        });
    });
}

client.connect();