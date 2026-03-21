import mongoose from "mongoose";

interface ICustomer extends mongoose.Document {
  name: string;
  email: string;
  phone: string;
  password: string;
  avtar?: string;
  address: {
    houseNo?: string;
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  orderHistory: {
    orderId: mongoose.Schema.Types.ObjectId;
    orderDate: Date;
  }[];
  whishList: {
    productId: mongoose.Schema.Types.ObjectId;
    addedDate: Date;
  }[];
}

const customerSchema = new mongoose.Schema<ICustomer>({
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
}, { timestamps: true });

const Customer = mongoose.model<ICustomer>("Customer", customerSchema);

export default Customer;