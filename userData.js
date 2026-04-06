// Sample user data for initial database population
// This file defines a global array `sampleUsers` that is used
// by `database.js` when initializing the localStorage-backed
// database the first time the site is opened.  You can add
// additional customer objects here for testing or seeding purposes.

window.sampleUsers = [
    {
        id: 1001,
        email: "john.doe@example.com",
        password: "password123", // NOTE: plain text for demo only
        firstName: "John",
        lastName: "Doe",
        phone: "+91 98765 43210",
        address: "123 Maple Street, Varanasi, India",
        createdAt: "2026-02-01T10:00:00Z",
        totalOrders: 2,
        totalSpent: 4500
    },
    {
        id: 1002,
        email: "jane.smith@example.com",
        password: "esecurpass", // demo only
        firstName: "Jane",
        lastName: "Smith",
        phone: "+91 91234 56789",
        address: "456 Oak Avenue, Varanasi, India",
        createdAt: "2026-02-05T14:30:00Z",
        totalOrders: 1,
        totalSpent: 2500
    }
];
