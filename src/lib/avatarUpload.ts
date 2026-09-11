import { supabase } from "./supabase";

export interface UploadAvatarResult {
  url: string;
  error?: string;
}

/**
 * Uploads an image file to Supabase Storage bucket 'avatars'
 * and returns the public URL.
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<UploadAvatarResult> {
  try {
    if (!file) {
      return { url: "", error: "No file selected." };
    }

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      return { url: "", error: "Please upload an image (PNG, JPEG, WebP, or GIF)." };
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { url: "", error: "Image size must be less than 5MB." };
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `user_${userId}_${Date.now()}.${ext}`;

    // Try uploading to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.warn("Client storage upload failed, attempting fallback API endpoint:", uploadError);

      // Fallback: upload via server endpoint /api/upload-avatar
      const formData = new FormData();
      formData.append("avatar", file);
      formData.append("userId", userId);

      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/upload-avatar", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || uploadError.message || "Failed to upload image.");
      }

      const json = await res.json();
      return { url: json.publicUrl };
    }

    // Get public URL from Supabase Storage
    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(uploadData.path);

    return { url: publicUrlData.publicUrl };
  } catch (err: any) {
    console.error("Avatar upload error:", err);
    return { url: "", error: err.message || "Failed to upload avatar." };
  }
}
