// api/broadcast.js
import { Telegraf } from 'telegraf';
import owners from '../owner.json';
import premiums from '../premium.json';

const BOT_TOKEN = process.env.BOT_TOKEN || '8301035365:AAEEbqgG5sTQk7403gyl-bfBj7ZzX-QU-gY';

const bot = new Telegraf(BOT_TOKEN);

// CORS biar bisa dipanggil dari frontend
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { text, user } = req.body;          // user = {id, first_name, hash}
  if (!text || !user || !user.id)
    return res.status(400).json({ error: 'Missing payload' });

  const uid = String(user.id);
  const isOwner = owners.includes(uid);
  const isPremium = premiums.includes(uid);

  if (!isOwner && !isPremium)
    return res.status(403).json({ error: 'Akses ditolak' });

  try {
    // 1. Kumpulkan chat target
    const targets = new Set<number>();

    // Premium/owner → semua grup tempat bot ada
    const chatMembers = await bot.telegram.getMe().then(() =>
      bot.telegram.getUpdates(0, 100, -1) // ambil 100 update terakhir
        .then(upd => upd
          .filter(u => u.message?.chat?.type.endsWith('group') || u.message?.chat?.type === 'supergroup')
          .map(u => u.message.chat.id))
    ).catch(() => [] as number[]);

    chatMembers.forEach(id => targets.add(id));

    // Owner → tambahkan PM semua user yang pernah start
    if (isOwner) {
      const users = await bot.telegram.getUpdates(0, 100, -1)
        .then(upd => upd
          .filter(u => u.message?.chat?.type === 'private')
          .map(u => u.message.chat.id));
      users.forEach(id => targets.add(id));
    }

    const arr = [...targets];
    if (!arr.length)
      return res.json({ ok: true, sent: 0, message: 'Tidak ada target' });

    // 2. Kirim
    const results = await Promise.allSettled(
      arr.map(id => bot.telegram.sendMessage(id, text))
    );
    const sent = results.filter(r => r.status === 'fulfilled').length;
    return res.json({ ok: true, sent, total: arr.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
