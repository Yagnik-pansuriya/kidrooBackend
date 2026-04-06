import mongoose, { Schema, Document } from "mongoose";

export interface IPermission {
  route: string;        // unique route ("/dashboard", "/users")
  label: string;        // sidebar name
  visible: boolean;     // show in sidebar
  enabled: boolean;     // allow API/route access
}

export interface IUserPermission extends Document {
  userId: mongoose.Types.ObjectId;
  permissions: IPermission[];
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>({
  route: { type: String, required: true },
  label: { type: String, required: true },
  visible: { type: Boolean, default: true },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const UserPermissionSchema = new Schema<IUserPermission>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    unique: true, 
    index: true 
  },
  permissions: [PermissionSchema],
}, { 
  timestamps: true 
});

// Ensure no duplicate routes per user (at logic level usually, but we could add a pre-save hook)
UserPermissionSchema.pre<IUserPermission>("save", async function () {
    const routes = this.permissions.map(p => p.route);
    const hasDuplicates = routes.some((route, index) => routes.indexOf(route) !== index);
    if (hasDuplicates) {
        throw new Error("Duplicate routes are not allowed for a single user.");
    }
});

const UserPermission = mongoose.model<IUserPermission>("UserPermission", UserPermissionSchema);

export default UserPermission;
