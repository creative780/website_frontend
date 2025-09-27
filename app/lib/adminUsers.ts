export const adminUsers = [
  { username: 'saim1234', password: 'saim1234' },
  // Add more manually if needed
];

export function isValidAdmin(username: string, password: string) {
  return adminUsers.some(user => user.username === username && user.password === password);
}