import { Context } from 'grammy';
import { MESSAGES, WELCOME_MESSAGE_TTL } from '../config/constants';

export async function handleNewMember(ctx: Context) {
    if (!ctx.chatMember) return;

    const { new_chat_member, old_chat_member } = ctx.chatMember;

    // Логика: если пользователь стал "участником" (или админом), и до этого его не было
    const isPresent = ['member', 'administrator', 'creator'].includes(new_chat_member.status);
    const wasAbsent = ['left', 'kicked'].includes(old_chat_member.status);

    // Считаем новым участником ЛЮБОЙ переход из "нет в чате" в "есть в чате"
    if (isPresent && wasAbsent) {
        if (new_chat_member.user.is_bot) return;

        const name = new_chat_member.user.first_name || 'User';
        const text = MESSAGES.WARNINGS.WELCOME(name);

        try {
            // Отправляем приветствие и удаляем через 60 сек
            const msg = await ctx.reply(text);
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), WELCOME_MESSAGE_TTL);
        } catch (error) {
            console.error('❌ Ошибка приветственного сообщения:', error instanceof Error ? error.message : error);
        }
    }
}
