import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_STORAGE_KEY = '@cartograph/mock-auth-session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export interface AuthServiceContract {
  login(input: LoginInput): Promise<AuthUser>;
  logout(): Promise<void>;
  register(input: RegisterInput): Promise<AuthUser>;
}

// TODO(ERIC): Connect backend authentication endpoints and replace local session persistence.
class MockAuthService implements AuthServiceContract {
  async login({ email }: LoginInput): Promise<AuthUser> {
    const user = { id: 'demo-user', email: email.trim().toLowerCase(), name: 'Carter' };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  }

  async register({ email, name }: RegisterInput): Promise<AuthUser> {
    const user = { id: `demo-${Date.now()}`, email: email.trim().toLowerCase(), name: name.trim() };
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  }

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export const AuthService: AuthServiceContract = new MockAuthService();