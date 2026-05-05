declare module 'web-push' {
    export type PushSubscription = {
        endpoint: string;
        expirationTime?: number | null;
        keys: {
            p256dh: string;
            auth: string;
        };
    };

    export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

    export function sendNotification(
        subscription: PushSubscription,
        payload: string,
        options?: Record<string, unknown>
    ): Promise<void>;
}
