import Skill from "../models/skill";

class SkillService {
  async getAllSkills(search?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: regex },
        { description: regex },
      ];
    }
    const skills = await Skill.find(filter).sort({ position: 1, _id: 1 }).lean();
    return skills;
  }

  async getSkillById(id: string) {
    const skill = await Skill.findById(id).lean();
    return skill;
  }

  async createSkill(skillData: any) {
    // Auto-assign position if not provided
    if (skillData.position === undefined || skillData.position === null) {
      const maxPos = await Skill.findOne().sort({ position: -1 }).select("position").lean();
      skillData.position = (maxPos?.position ?? -1) + 1;
    }
    const skill = await Skill.create(skillData);
    return skill;
  }

  async updateSkill(id: string, skillData: any) {
    const skill = await Skill.findByIdAndUpdate(id, skillData, {
      new: true,
      runValidators: true,
    });
    return skill;
  }

  async deleteSkillById(id: string) {
    const skill = await Skill.findByIdAndDelete(id);
    return skill;
  }
}

export const skillService = new SkillService();
