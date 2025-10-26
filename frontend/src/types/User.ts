export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
  authenticated: boolean;
}

export interface UserResponse {
  authenticated: boolean;
  id?: string;
  name?: string;
  email?: string;
  picture?: string;
}
