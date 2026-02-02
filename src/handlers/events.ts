import { Context } from 'grammy';
import { MESSAGES } from '../config/constants';

export async function handleNewMember(ctx: Context) {
    if (!ctx.message?.new_chat_members) return;

    for (const member of ctx.message.new_chat_members) {
        if (member.is_bot) continue;

        // const name = member.first_name || 'User';
        // const text = MESSAGES.WARNINGS.WELCOME(name);

        // try {
        //     // Отправляем приветствие и удаляем через некоторое время (опционально, но чтобы не засорять чат)
        //     const msg = await ctx.reply(text);

        //     // Можно удалять приветствие через 60 сек, чтобы чат был чище
        //     setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 60000);
        // } catch (error) {
        //     console.error('❌ Welcome message error:', error);
        // }
    }
}
