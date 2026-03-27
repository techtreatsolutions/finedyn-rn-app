import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'finedyn_token';
const USER_KEY = 'finedyn_user';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function removeToken() {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getUser() {
  const json = await AsyncStorage.getItem(USER_KEY);
  return json ? JSON.parse(json) : null;
}

export async function setUser(user) {
  return AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function removeUser() {
  return AsyncStorage.removeItem(USER_KEY);
}

export async function clearAll() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}
