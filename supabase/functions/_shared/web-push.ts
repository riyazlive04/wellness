
import webpush from "npm:web-push@3.6.7";

export interface PushSubscription {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export const sendWebPush = async (
    subscription: PushSubscription,
    payload: string,
    vapidDetails: {
        subject: string;
        publicKey: string;
        privateKey: string;
    }
) => {
    try {
        webpush.setVapidDetails(
            vapidDetails.subject,
            vapidDetails.publicKey,
            vapidDetails.privateKey
        );

        // web-push expects keys in a specific format in the subscription object
        // If our DB stores flattened keys (p256dh, auth), we construct the object here
        // The subscription argument matches the PushSubscription interface defined above
        const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth
            }
        };

        const result = await webpush.sendNotification(pushSubscription, payload, {
            TTL: 86400, // 24 hours - keep message in push queue for offline devices
            urgency: 'high', // Ensures delivery on mobile even in doze/battery saver mode
        });
        return { success: true, statusCode: result.statusCode };
    } catch (error: any) {
        console.error('WebPush Error:', error);
        return {
            success: false,
            error: error.message,
            statusCode: error.statusCode
        };
    }
};
