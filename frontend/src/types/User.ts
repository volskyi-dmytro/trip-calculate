export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
  authenticated: boolean;
  role?: 'USER' | 'ADMIN';
  isAdmin?: boolean;
}

export interface UserResponse {
  authenticated: boolean;
  id?: string;
  name?: string;
  email?: string;
  picture?: string;
  role?: string;
  isAdmin?: boolean;
}
