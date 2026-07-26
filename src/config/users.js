// config/users.js
module.exports = {
  users: {
    amanpandey: {
      id: 2,
      name: "Aman Pandey",
      email: "amanpandey@gmail.com",
      role: "MERCHANT",
      merchantId: 1,
    },
    gopalkrishna: {
      id: 5,
      name: "Gopal Kirshna",
      email: "gopalkrishna@gmail.com",
      role: "MERCHANT",
      merchantId: 1,
    },
    soniakalonia: {
      id: 3,
      name: "Sonia Kalonia",
      email: "soniakalonia@gmail.com",
      role: "MERCHANT",
      merchantId: 2,
    },
    piyushkirola: {
      id: 4,
      name: "Piyush Kirola",
      email: "piyushkirola@gmail.com",
      role: "MERCHANT",
      merchantId: 3,
    },
    rajeshkhanna: {
      id: 7,
      name: "Rajesh Khanna",
      email: "rajeshkhanna@gmail.com",
      role: "MERCHANT",
      merchantId: 4,
    },
    kavyaiyer: {
      id: 15,
      name: "Kavya Iyer",
      email: "kavyaiyer@gmail.com",
      role: "MERCHANT",
      merchantId: 4,
    },
    raghunathmishra: {
      id: 8,
      name: "Raghunath Mishra",
      email: "raghunathmishra@gmail.com",
      role: "MERCHANT",
      merchantId: 5,
    },
    amishabaghel: {
      id: 9,
      name: "Amisha Baghel",
      email: "amishabaghel@gmail.com",
      role: "MERCHANT",
      merchantId: 6,
    },
    snehapatel: {
      id: 12,
      name: "Sneha Patel",
      email: "snehapatel@gmail.com",
      role: "MERCHANT",
      merchantId: 7,
    },
    arjunmehta: {
      id: 14,
      name: "Arjun Mehta",
      email: "arjunmehta@gmail.com",
      role: "MERCHANT",
      merchantId: 8,
    },
    ananyanair: {
      id: 13,
      name: "Ananya Nair",
      email: "ananyanair@gmail.com",
      role: "MERCHANT",
      merchantId: 9,
    },
    deepakgupta: {
      id: 11,
      name: "Deepak Gupta",
      email: "deepakgupta@gmail.com",
      role: "MERCHANT",
      merchantId: 10,
    },
    priyasharma: {
      id: 10,
      name: "Priya Sharma",
      email: "priyasharma@gmail.com",
      role: "MERCHANT",
      merchantId: 11,
    },
    denisegusikowski: {
      id: 17,
      name: "Denise Gusikowski",
      email: "denisegusikowski@gmail.com",
      role: "MERCHANT",
      merchantId: 12,
    },
    jovannyswaniawski: {
      id: 18,
      name: "Jovanny Swaniawski",
      email: "jovannyswaniawski@gmail.com",
      role: "MERCHANT",
      merchantId: 13,
    },
    karenohara: {
      id: 20,
      name: "Karen OHara",
      email: "karenohara@gmail.com",
      role: "MERCHANT",
      merchantId: 14,
    },
    abbeybeahan: {
      id: 22,
      name: "Abbey Beahan",
      email: "abbeybeahan@gmail.com",
      role: "MERCHANT",
      merchantId: 15,
    },
    vanessamcclure: {
      id: 19,
      name: "Vanessa McClure",
      email: "vanessamcclure@gmail.com",
      role: "MERCHANT",
      merchantId: 15,
    },
    smithgoyal: {
      id: 16,
      name: "Smith Goyal",
      email: "smithgoyal@gmail.com",
      role: "MERCHANT",
      merchantId: 16,
    },
    allenwaters: {
      id: 21,
      name: "Allen Waters",
      email: "allenwaters@gmail.com",
      role: "MERCHANT",
      merchantId: 17,
    },
    meeranair: {
      id: 6,
      name: "Meera Nair",
      email: "meeranair@gmail.com",
      role: "MERCHANT",
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
