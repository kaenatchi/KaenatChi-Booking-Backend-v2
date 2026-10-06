const BACKEND_URL = "https://script.google.com/macros/s/AKfycbyEh9txZP7nWdLoTtNvbQn_aKxiI0syH3M8Qh0TXR6C6AFC5rEuyidq1tMo5ufpKdXzHg/exec";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "METHOD_NOT_ALLOWED",
          message: "Only GET is supported by this transport.",
        }),
        {
          status: 405,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }
      );
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(BACKEND_URL);
    targetUrl.search = incomingUrl.search;

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: "application/json",
        },
      });

      const body = await upstream.text();

      return new Response(body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type":
            upstream.headers.get("content-type") ||
            "application/json; charset=UTF-8",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "TRANSPORT_UPSTREAM_FAILED",
          message: "Booking backend could not be reached.",
        }),
        {
          status: 502,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }
      );
    }
  },
};
