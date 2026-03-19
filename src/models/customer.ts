import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    error: "Name is required",
  },
  email: {
    type: String,
    unique: true,
    error: "Email is required",
  },
  phone: {
    type: String,
    required: true,
    error: "Phone number is required",
  },
  password: {
    type: String,
    required: true,
    error: "Password is required",
  },
  avtar: {
    type: String,
    required: false,
  },
  address: {
    houseNo: {
      type: String,
    },
    street: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    zipCode: {
      type: String,
    },
    country: {
      type: String,
    },
  },
  orderHistory: [
    {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
      orderDate: {
        type: Date,
      },
    },
  ],
  whishList: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
      addedDate: {
        type: Date,
      },
    },
  ],
});

// const User = mongoose.model<IUser>("User", userSchema);

// export default User;