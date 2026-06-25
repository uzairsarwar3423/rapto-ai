import axios from "axios";

async function main() {
  const backendUrl = "http://localhost:5000/api/v1";

  console.log("Logging in...");
  const loginRes = await axios.post(`${backendUrl}/auth/login`, {
    email: "ali@techflow.eng",
    password: "Test@1234",
  });

  // Extract token from cookie (since the auth uses HTTPOnly cookie or directly returns it)
  // Let's print the login response body first
  console.log("LOGIN RESPONSE:", loginRes.data);
  const token = loginRes.data.data.accessToken;
  console.log("ACCESS TOKEN:", token);

  const meetingId = "cmq9k8bjh0008h2wv3qusosyn";

  try {
    console.log(`\n1. Testing with limit: 100 (number)`);
    const res1 = await axios.get(`${backendUrl}/action-items`, {
      params: { meetingId, limit: 100 },
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("RES 1 STATUS:", res1.status, "DATA COUNT:", res1.data.data?.length);
  } catch (err: any) {
    console.error("RES 1 ERROR STATUS:", err.response?.status);
    console.error("RES 1 ERROR DATA:", JSON.stringify(err.response?.data, null, 2));
  }

  try {
    console.log(`\n2. Testing with limit: "100" (string)`);
    const res2 = await axios.get(`${backendUrl}/action-items`, {
      params: { meetingId, limit: "100" },
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("RES 2 STATUS:", res2.status, "DATA COUNT:", res2.data.data?.length);
  } catch (err: any) {
    console.error("RES 2 ERROR STATUS:", err.response?.status);
    console.error("RES 2 ERROR DATA:", JSON.stringify(err.response?.data, null, 2));
  }
}

main().catch(console.error);
