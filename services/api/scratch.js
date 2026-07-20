const axios = require('axios');

async function test() {
  try {
    // 1. Get access token
    const loginRes = await axios.post('http://localhost:5000/api/v1/auth/login', {
      email: 'demo@vocaply.com',
      password: 'password'
    });
    const token = loginRes.data.data.accessToken;

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Fetch /analytics/overview
    const overviewRes = await axios.get('http://localhost:5000/api/v1/analytics/overview', { headers });
    console.log("OVERVIEW RESPONSE:");
    console.log(JSON.stringify(overviewRes.data, null, 2));

    // 3. Fetch /analytics/trends
    const trendsRes = await axios.get('http://localhost:5000/api/v1/analytics/trends?metric=fulfillmentRate&granularity=week', { headers });
    console.log("\nTRENDS RESPONSE:");
    console.log(JSON.stringify(trendsRes.data, null, 2));

  } catch(e) {
    console.error("Error:", e.message);
    if(e.response) {
      console.error(e.response.data);
    }
  }
}

test();
