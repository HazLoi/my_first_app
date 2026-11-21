export interface UserProfile {
  id: string;
  phone: string;
  displayName: string;
  role: 'player' | 'admin';
  balance: number;
  level?: number;
  avatar?: number;
}

export interface Session {
  token: string;
  expiresAt?: string;
  user: UserProfile;
}

export interface LoginInput {
  phone: string;
  password: string;
  remember: boolean;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

/** Dịch vụ xác thực tách riêng để thay mock bằng API thật (PHP). */
export interface AuthService {
  login(input: LoginInput): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  logout(token: string): Promise<void>;
  /** Kiểm tra token đã lưu còn hiệu lực không và lấy hồ sơ mới nhất (số xu). */
  me(token: string): Promise<UserProfile>;
  /** Nạp xu giả (nút "+" ở sảnh). Chỉ MockAuth hỗ trợ; API thật trả lỗi. */
  topUp?(token: string, amount: number): Promise<UserProfile>;
}
