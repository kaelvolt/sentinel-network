import { sendSignalAlert, sendDigest, sendPlainText } from './telegram.js';
import type { Signal, Digest } from '@kael/shared';

class TelegramNotifier {
    constructor(private token: string, private chatId: string) {}

    async notifySignal(signal: Signal, evidenceLinks: string[]) {
        await sendSignalAlert(this.token, this.chatId, { signal, evidenceLinks });
    }

    async notifyDigest(digest: Digest) {
        await sendDigest(this.token, this.chatId, { digest });
    }

    async sendStatusUpdate(status: string) {
        await sendPlainText(this.token, this.chatId, `Status Update: ${status}`);
    }

    async handleCommand(command: string) {
        switch (command) {
            case '/status':
                await this.sendStatusUpdate('System is operational.');
                break;
            case '/quiet':
                await this.sendStatusUpdate('Notifications are now suppressed.');
                break;
            case '/verbose':
                await this.sendStatusUpdate('Verbose notifications enabled.');
                break;
            case '/autopilot on':
                await this.sendStatusUpdate('Autopilot mode activated.');
                break;
            case '/autopilot off':
                await this.sendStatusUpdate('Autopilot mode deactivated.');
                break;
            default:
                await sendPlainText(this.token, this.chatId, 'Unknown command.');
                break;
        }
    }
}

export default TelegramNotifier;