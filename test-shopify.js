const domain = 'autonordservice.myshopify.com';
const token = 'd34be3e1d0a682d4bf371e1c4497760d';

async function testConnection() {
  console.log(`Testing connection to ${domain}...`);
  
  const query = `
    {
      shop {
        name
        primaryDomain {
          url
        }
      }
      products(first: 1) {
        edges {
          node {
            title
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${domain}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ Shopify API Error:', JSON.stringify(data.errors, null, 2));
    } else {
      console.log('✅ Connection Successful!');
      console.log('Shop Name:', data.data.shop.name);
      console.log('Shop URL:', data.data.shop.primaryDomain.url);
      if (data.data.products.edges.length > 0) {
        console.log('First Product:', data.data.products.edges[0].node.title);
      } else {
        console.log('⚠️ No products found (but connection works)');
      }
    }
  } catch (error) {
    console.error('❌ Network Error:', error.message);
  }
}

testConnection();
