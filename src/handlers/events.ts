import { Context } from 'grammy';
import { MESSAGES, WELCOME_MESSAGE_TTL } from '../config/constants';

export async function handleNewMember(ctx: Context) {
    console.log('🔔 NEW_MEMBER EVENT - Chat ID:', ctx.chat?.id, 'Chat Title:', ctx.chat?.title);

    if (!ctx.message?.new_chat_members) {
        console.log('⚠️ No new_chat_members in message');
        return;
    }

    console.log('👥 Members count:', ctx.message.new_chat_members.length);

    for (const member of ctx.message.new_chat_members) {
        console.log('👤 Processing member:', member.first_name, 'ID:', member.id, 'Is bot:', member.is_bot);

        if (member.is_bot) {
            console.log('⏭️ Skipping bot');
            continue;
        }

        const name = member.first_name || 'User';
        const text = MESSAGES.WARNINGS.WELCOME(name);

        try {
            console.log('📤 Sending welcome to chat', ctx.chat!.id);
            const msg = await ctx.reply(text);
            console.log('✅ Welcome sent, message_id:', msg.message_id);
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), WELCOME_MESSAGE_TTL);
        } catch (error) {
            console.error('❌ Error sending welcome:', {
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined,
                chatId: ctx.chat?.id,
                memberName: name
            });
        }
    }
}
