// International Names
const firstNames = [
  'John', 'Emma', 'Michael', 'Sophia', 'William', 'Olivia', 'James', 'Ava',
  'Alexander', 'Isabella', 'Daniel', 'Mia', 'David', 'Charlotte', 'Joseph', 'Amelia',
  'Benjamin', 'Harper', 'Samuel', 'Evelyn', 'Matthew', 'Abigail', 'Andrew', 'Emily',
  'Joshua', 'Elizabeth', 'Christopher', 'Sofia', 'Gabriel', 'Avery', 'Ryan', 'Scarlett',
  'Nathan', 'Victoria', 'Caleb', 'Grace', 'Jonathan', 'Chloe', 'Christian', 'Zoey'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
  'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green'
];

const emailDomains = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'protonmail.com', 'gmx.com', 'mail.com',
  'aol.com', 'zoho.com', 'yandex.com', 'tutanota.com'
];

const countryCodes = [
  '+1', '+44', '+61', '+91', '+86', '+81', '+49', '+33',
  '+39', '+55', '+52', '+82', '+31', '+46', '+41', '+65',
  '+971', '+966', '+27', '+34', '+7', '+61', '+64', '+351',
  '+353', '+45', '+47', '+46', '+41', '+61', '+64', '+65'
];

const paymentModes = ['UPI', 'CARD', 'WALLET', 'NETBANKING'];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomName() {
  return `${random(firstNames)} ${random(lastNames)}`;
}

function randomEmail(name) {
  const cleanName = name.toLowerCase().replace(' ', '.');
  const num = randomInt(100, 99999);
  return `${cleanName}${num}@${random(emailDomains)}`;
}

function randomPhone() {
  const code = random(countryCodes);
  const length = Math.random() > 0.5 ? 10 : 9;
  let number = '';
  for (let i = 0; i < length; i++) {
    number += randomInt(0, 9);
  }
  return `${code} ${number}`;
}

function randomAmount(min = 100, max = 5000) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomPaymentMode() {
  return random(paymentModes);
}

function randomCustomer() {
  const name = randomName();
  return {
    name: name,
    email: randomEmail(name),
    phone: randomPhone()
  };
}

module.exports = {
  randomName,
  randomEmail,
  randomPhone,
  randomAmount,
  randomPaymentMode,
  randomCustomer,
  randomInt,
  random
};