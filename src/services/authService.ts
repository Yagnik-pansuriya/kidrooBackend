import User from "../models/user";

class AuthService {
  async getUserByEmail(email: string) {
    const user = await User.findOne({ email }).select("+password");
    return user;
  };

}

export const authService = new AuthService();