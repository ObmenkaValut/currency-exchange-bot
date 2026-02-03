import { Context } from 'grammy';
import { MESSAGES, WELCOME_MESSAGE_TTL } from '../config/constants';

export async function handleNewMember(ctx: Context) {
    if (!ctx.message?.new_chat_members) return;

    for (const member of ctx.message.new_chat_members) {
        if (member.is_bot) continue;

        // const name = member.first_name || 'User';
        // const text = MESSAGES.WARNINGS.WELCOME(name);

        // try {
        //     // Отправляем приветствие и удаляем через 60 сек, чтобы не засорять чат
        //     const msg = await ctx.reply(text);
        //     setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), WELCOME_MESSAGE_TTL);
        // } catch (error) {
        //     console.error('❌ Ошибка приветственного сообщения:', error instanceof Error ? error.message : error);
        // }
    }
}
