module.exports = {
  users: {
    rahulsharma: {
      id: 2,
      name: "Rahul Sharma",
      email: "rahulsharma@gmail.com",
      role: "USER",
      merchantId: 1,
    },
    ankitkumar: {
      id: 5,
      name: "Ankit Kumar",
      email: "ankitkumar@gmail.com",
      role: "USER",
      merchantId: 1,
    },
    amitverma: {
      id: 3,
      name: "Amit Verma",
      email: "amitverma@gmail.com",
      role: "USER",
      merchantId: 2,
    },
    rohitsingh: {
      id: 4,
      name: "Rohit Singh",
      email: "rohitsingh@gmail.com",
      role: "USER",
      merchantId: 3,
    },
    vivekgupta: {
      id: 7,
      name: "Vivek Gupta",
      email: "vivekgupta@gmail.com",
      role: "USER",
      merchantId: 4,
    },
    anjalikumar: {
      id: 15,
      name: "Anjali Kumar",
      email: "anjalikumar@gmail.com",
      role: "USER",
      merchantId: 4,
    },
    karanmalhotra: {
      id: 8,
      name: "Karan Malhotra",
      email: "karanmalhotra@gmail.com",
      role: "USER",
      merchantId: 5,
    },
    rajpatel: {
      id: 9,
      name: "Raj Patel",
      email: "rajpatel@gmail.com",
      role: "USER",
      merchantId: 6,
    },
    priyasharma: {
      id: 12,
      name: "Priya Sharma",
      email: "priyasharma@gmail.com",
      role: "USER",
      merchantId: 7,
    },
    poojasingh: {
      id: 14,
      name: "Pooja Singh",
      email: "poojasingh@gmail.com",
      role: "USER",
      merchantId: 8,
    },
    nehaverma: {
      id: 13,
      name: "Neha Verma",
      email: "nehaverma@gmail.com",
      role: "USER",
      merchantId: 9,
    },
    nikhiljoshi: {
      id: 11,
      name: "Nikhil Joshi",
      email: "nikhiljoshi@gmail.com",
      role: "USER",
      merchantId: 10,
    },
    mohitagarwal: {
      id: 10,
      name: "Mohit Agarwal",
      email: "mohitagarwal@gmail.com",
      role: "USER",
      merchantId: 11,
    },
    riyagupta: {
      id: 17,
      name: "Riya Gupta",
      email: "riyagupta@gmail.com",
      role: "USER",
      merchantId: 12,
    },
    simranmalhotra: {
      id: 18,
      name: "Simran Malhotra",
      email: "simranmalhotra@gmail.com",
      role: "USER",
      merchantId: 13,
    },
    nishaagarwal: {
      id: 20,
      name: "Nisha Agarwal",
      email: "nishaagarwal@gmail.com",
      role: "USER",
      merchantId: 14,
    },
    sandeepyadav: {
      id: 22,
      name: "Sandeep Yadav",
      email: "sandeepyadav@gmail.com",
      role: "USER",
      merchantId: 15,
    },
    kavyapatel: {
      id: 19,
      name: "Kavya Patel",
      email: "kavyapatel@gmail.com",
      role: "USER",
      merchantId: 15,
    },
    snehamehta: {
      id: 16,
      name: "Sneha Mehta",
      email: "snehamehta@gmail.com",
      role: "USER",
      merchantId: 16,
    },
    aartijoshi: {
      id: 21,
      name: "Aarti Joshi",
      email: "aartijoshi@gmail.com",
      role: "USER",
      merchantId: 17,
    },
    arjunmehta: {
      id: 6,
      name: "Arjun Mehta",
      email: "arjunmehta@gmail.com",
      role: "USER",
      merchantId: 17,
    },
  },
  // Helper function to get user by merchant ID
  getUsersByMerchant: function (merchantId) {
    const result = [];
    for (const [key, user] of Object.entries(this.users)) {
      if (user.merchantId === merchantId) {
        result.push({ key, ...user });
      }
    }
    return result;
  },
  // Helper function to get all merchants with users
  getMerchantsWithUsers: function () {
    const merchants = {};
    for (const [key, user] of Object.entries(this.users)) {
      if (!merchants[user.merchantId]) {
        merchants[user.merchantId] = [];
      }
      merchants[user.merchantId].push({ key, ...user });
    }
    return merchants;
  },
};