import mongoose, { Document, Schema } from "mongoose";

export interface IInventoryTransaction extends Document {
  targetModel: "Product" | "ProductVariant";
  targetId: mongoose.Types.ObjectId;
  quantity: number; // positive for restock/return, negative for purchase/deduction
  type: "PURCHASE" | "RESTOCK" | "RETURN" | "ADJUSTMENT";
  reference?: string; // e.g. Order ID 
  notes?: string; 
  createdAt: Date;
  updatedAt: Date;
}

const inventoryTransactionSchema = new Schema<IInventoryTransaction>({
  targetModel: {
    type: String,
    required: true,
    enum: ["Product", "ProductVariant"], // Supports both simple toys and toys with variants
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel', // Dynamic reference depending on targetModel
  },
  quantity: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["PURCHASE", "RESTOCK", "RETURN", "ADJUSTMENT"],
  },
  reference: {
    type: String,
  },
  notes: {
    type: String,
  },
}, { timestamps: true });

const InventoryTransaction = mongoose.model<IInventoryTransaction>("InventoryTransaction", inventoryTransactionSchema);

export default InventoryTransaction;
