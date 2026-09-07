import { Platform } from "react-native";
import { RAZORPAY_KEY_ID } from "../config/razorpay";
import { colors } from "../theme/colors";

/**
 * Dynamically inject Razorpay Checkout script on Web
 */
export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.getElementById("razorpay-checkout-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Open Razorpay Checkout modal for selected plan
 */
export async function openRazorpayCheckout({ plan, user, onSuccess, onFailure }) {
  if (!plan) return;

  // Extract amount in Paise (?49 = 4900, ?89 = 8900, ?129 = 12900, ?249 = 24900)
  const priceNum = parseInt(String(plan.price || "").replace(/\D/g, ""), 10) || 49;
  const amountPaise = priceNum * 100;

  if (Platform.OS === "web") {
    const isLoaded = await loadRazorpayScript();
    if (!isLoaded || !window.Razorpay) {
      onFailure && onFailure(new Error("Unable to load Razorpay payment gateway. Please check internet connection."));
      return;
    }

    const options = {
      key: RAZORPAY_KEY_ID,
      amount: amountPaise,
      currency: "INR",
      name: "Staytup Music",
      description: `Staytup Premium - ${plan?.name || "Plan"} (${plan?.highlight || "VIP"})`,
      image: "https://staytupnow.firebaseapp.com/favicon.ico",
      prefill: {
        name: user?.username || "Staytup Listener",
        email: user?.email || "listener@staytup.com",
        contact: "",
      },
      theme: {
        color: colors.primary || "#1DB954",
      },
      handler: function (response) {
        if (response && response.razorpay_payment_id) {
          onSuccess &&
            onSuccess({
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id || null,
              signature: response.razorpay_signature || null,
              amount: priceNum,
              planId: plan.id,
              planName: plan.name,
              provider: "razorpay",
            });
        } else {
          onFailure && onFailure(new Error("Payment completed but no payment ID received."));
        }
      },
      modal: {
        ondismiss: function () {
          onFailure && onFailure(new Error("Payment cancelled by user."));
        },
      },
    };

    try {
      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on("payment.failed", function (errResponse) {
        const desc = errResponse?.error?.description || "Payment failed.";
        onFailure && onFailure(new Error(desc));
      });
      rzpInstance.open();
    } catch (err) {
      console.warn("Razorpay execution error:", err);
      onFailure && onFailure(err);
    }
  } else {
    // Native fallback simulation for test environment
    const testPaymentId = "pay_test_" + Date.now().toString(36);
    onSuccess &&
      onSuccess({
        paymentId: testPaymentId,
        orderId: "order_test",
        amount: priceNum,
        planId: plan.id,
        planName: plan.name,
        provider: "razorpay_test",
      });
  }
}
